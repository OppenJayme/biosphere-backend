# Synthetic B2 retention rehearsal only. Default is a read-free, network-free plan.
# This consumes the owner-scoped DPAPI packet; it never creates keys or changes
# bucket policy. Run once per packet. Keep uncertain receipts for reconciliation.
param(
  [switch]$Run,
  [switch]$Inspect,
  [string]$RunId,
  [string]$BucketName,
  [string]$NodeExecutable,
  [string]$RetentionMode = 'governance',
  [int]$RetentionHours = 24
)
$ErrorActionPreference = 'Stop'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
if (-not $Run -and -not $Inspect) {
  @{code='B2_RETENTION_PLAN';liveChanges=$false;retentionMode='governance';retentionHours=24;maxUploadedBytes=1024;uploadCount=1;deleteChecks=2;requiresScopedKeyPacket=$true} | ConvertTo-Json -Compress
  exit 0
}
$stage='OPTIONS'
$uploadMayExist=$false
$receipt=$null
$receiptPath=$null
$denials=0
$reads=0
$failureCode='B2_RETENTION_STOPPED'
function Assert-Safe([bool]$Condition) { if (-not $Condition) { throw 'BOUNDARY_REJECTED' } }
function Assert-Regular([string]$Path,[long]$Maximum) {
  $item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  Assert-Safe (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $item.Length -gt 0 -and $item.Length -le $Maximum)
}
function Read-Protected([string]$Path) {
  Assert-Regular $Path 65536
  $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($Path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  try { return ([Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json -ErrorAction Stop) } finally { [Array]::Clear($clear,0,$clear.Length) }
}
function Write-Receipt([switch]$Create) {
  $clear=[Text.Encoding]::UTF8.GetBytes(($script:receipt|ConvertTo-Json -Depth 8 -Compress))
  try { $cipher=[Security.Cryptography.ProtectedData]::Protect($clear,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) } finally { [Array]::Clear($clear,0,$clear.Length) }
  if ($Create) {
    $stream=[IO.File]::Open($script:receiptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($cipher,0,$cipher.Length);$stream.Flush($true)}finally{$stream.Dispose()}
  }else{
    Assert-Regular $script:receiptPath 65536
    $temp=$script:receiptPath+'.'+[Guid]::NewGuid().ToString()+'.tmp'
    $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($cipher,0,$cipher.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    # Atomic replacement preserves the previous receipt if writing fails.
    [IO.File]::Replace($temp,$script:receiptPath,[System.Management.Automation.Language.NullString]::Value)
  }
}
function Invoke-Codec($Request) {
  Assert-Regular $NodeExecutable 268435456
  $helper=Join-Path $PSScriptRoot 'b2-retention-fixture.cjs'; Assert-Regular $helper 16384
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=$NodeExecutable; $info.Arguments='"'+$helper+'"'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables.Clear()
  foreach($name in @('SystemRoot','WINDIR','SystemDrive','TEMP','TMP')) {
    $value=[Environment]::GetEnvironmentVariable($name)
    if($null -ne $value){$info.EnvironmentVariables[$name]=$value}
  }
  $child=[Diagnostics.Process]::new();$child.StartInfo=$info
  try {
    Assert-Safe ($child.Start())
    $out=$child.StandardOutput.ReadToEndAsync();$err=$child.StandardError.ReadToEndAsync()
    $child.StandardInput.Write(($Request|ConvertTo-Json -Compress));$child.StandardInput.Close()
    if(-not $child.WaitForExit(10000)){$child.Kill();throw 'CODEC_TIMEOUT'}
    Assert-Safe ($child.ExitCode -eq 0 -and $err.Result.Length -eq 0 -and $out.Result.Length -le 4096)
    return ($out.Result|ConvertFrom-Json -ErrorAction Stop)
  }finally{$child.Dispose()}
}
function Invoke-B2([string]$Uri,[string]$Method,[hashtable]$Headers,$Body=$null) {
  $request=@{Uri=$Uri;Method=$Method;Headers=$Headers;TimeoutSec=20;MaximumRedirection=0;UseBasicParsing=$true;ErrorAction='Stop'}
  if($null -ne $Body){$request.Body=$Body;$request.ContentType='application/json'}
  $response=Invoke-WebRequest @request
  Assert-Safe ([int]$response.StatusCode -eq 200 -and $response.Content.Length -le 65536)
  return ($response.Content|ConvertFrom-Json -ErrorAction Stop)
}
function Assert-Capabilities($Actual,$Expected) {
  Assert-Safe (@($Actual).Count -eq @($Expected).Count)
  foreach($cap in $Expected){Assert-Safe (@($Actual) -ccontains $cap)}
}
function Assert-UploadUrl($Value) {
  Assert-Safe ($Value -is [string] -and $Value.Length -le 2048 -and $Value -notmatch '[\s\\]')
  $target=$null
  Assert-Safe ([Uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$target))
  Assert-Safe ($target.Scheme -ceq 'https' -and $target.IsDefaultPort -and $target.UserInfo.Length -eq 0 -and $target.Fragment.Length -eq 0)
  Assert-Safe ($target.DnsSafeHost -cmatch '^pod-[0-9]+(?:-[0-9]+)*\.(?:backblaze|backblazeb2)\.com$')
  $basePath='/b2api/v4/b2_upload_file'
  if($target.AbsolutePath -ceq $basePath) {
    # Native API documents this query form as well as the path form. Require
    # exactly one bucket and one destination; do not reconstruct the signed URL.
    Assert-Safe ($target.Query.Length -gt 1)
    $parameters=@{}
    foreach($pair in $target.Query.Substring(1).Split('&')) {
      Assert-Safe ($pair -cmatch '^(bucket|cvt)=([A-Za-z0-9_-]{1,256})$')
      $name=$Matches[1];$value=$Matches[2]
      Assert-Safe (-not $parameters.ContainsKey($name))
      $parameters[$name]=$value
    }
    Assert-Safe ($parameters.Count -eq 2 -and $parameters['bucket'] -ceq $packet.bucketId)
  }else{
    Assert-Safe ($target.Query.Length -eq 0 -and $target.AbsolutePath -cmatch '^/b2api/v4/b2_upload_file/([A-Za-z0-9_-]{1,128})/([A-Za-z0-9_-]{1,256})$')
    Assert-Safe ($Matches[1] -ceq $packet.bucketId)
  }
}
function Assert-File($File) {
  Assert-Safe ($File.accountId -ceq $packet.accountId -and $File.bucketId -ceq $packet.bucketId -and $File.fileName -ceq $receipt.fileName -and $File.action -ceq 'upload')
  Assert-Safe ($File.fileId -is [string] -and $File.fileId -cmatch '^[A-Za-z0-9_-]{1,256}$')
  if($null -ne $receipt.fileId){Assert-Safe ($File.fileId -ceq $receipt.fileId)}
  Assert-Safe ([long]$File.contentLength -eq $bytes.Length -and $File.contentSha1 -ceq $sha1Hex)
  Assert-Safe ($File.fileRetention.isClientAuthorizedToRead -is [bool] -and $File.fileRetention.isClientAuthorizedToRead)
  Assert-Safe ($File.fileRetention.value.mode -ceq 'governance' -and [long]$File.fileRetention.value.retainUntilTimestamp -eq $receipt.retainUntil)
}
function Read-Version {
  $auth=$sessions.fixtureWriter
  $meta=Invoke-B2 ($auth.api+'/b2api/v4/b2_get_file_info') 'POST' $auth.headers (@{fileId=$receipt.fileId}|ConvertTo-Json -Compress)
  Assert-File $meta
  $response=Invoke-WebRequest -Uri ($auth.download+'/b2api/v4/b2_download_file_by_id?fileId='+[Uri]::EscapeDataString($receipt.fileId)) -Method Get -Headers $auth.headers -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
  $returnedIds=@($response.Headers['X-Bz-File-Id'])
  Assert-Safe ([int]$response.StatusCode -eq 200 -and $returnedIds.Count -eq 1 -and [string]$returnedIds[0] -ceq $receipt.fileId)
  Assert-Safe ($response.RawContentStream.Length -eq $bytes.Length -and $response.RawContentStream.Length -le 1024)
  $copy=[IO.MemoryStream]::new()
  try {
    $response.RawContentStream.Position=0;$response.RawContentStream.CopyTo($copy)
    $verified=Invoke-Codec @{command='verify';runId=$RunId;key=$receipt.key;envelope=[Convert]::ToBase64String($copy.ToArray())}
    Assert-Safe ($verified.verified -eq $true -and $verified.sha256 -ceq $receipt.sha256)
  }finally{$copy.Dispose();$response.RawContentStream.Dispose()}
  $script:reads++
}
function Test-DeleteDenial([string]$Role,[string]$ExpectedCode) {
  $auth=$sessions[$Role]; $denied=$false
  try {
    $response=Invoke-WebRequest -Uri ($auth.api+'/b2api/v4/b2_delete_file_version') -Method Post -Headers $auth.headers -Body (@{fileName=$receipt.fileName;fileId=$receipt.fileId}|ConvertTo-Json -Compress) -ContentType 'application/json' -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
  }catch{
    # Only the documented status/code pair counts. Expired tokens, 404s,
    # timeouts, malformed errors and service failures cannot prove protection.
    if($null -eq $_.Exception.Response -or $null -eq $_.ErrorDetails){throw 'DELETE_UNCERTAIN'}
    Assert-Safe ($_.ErrorDetails.Message.Length -le 65536)
    $errorBody=$_.ErrorDetails.Message|ConvertFrom-Json -ErrorAction Stop
    Assert-Safe ([int]$_.Exception.Response.StatusCode -eq 401 -and $errorBody.status -eq 401 -and $errorBody.code -ceq $ExpectedCode)
    $denied=$true
  }
  if(-not $denied -and [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 300){
    # Preserve the most important negative result even if the success body is
    # malformed. The request targeted only the newly created fixture version.
    $script:failureCode='B2_RETENTION_DELETE_SUCCEEDED'
    $script:receipt.state='delete-succeeded';$script:receipt.deleteRole=$Role
    Write-Receipt
    throw 'DELETE_SUCCEEDED'
  }
  Assert-Safe $denied
  $script:denials++
}
try {
  if (($Run -and $Inspect) -or $RetentionMode -cne 'governance' -or $RetentionHours -ne 24) { throw 'OPTIONS' }
  if ($RunId -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') { throw 'RUN_ID' }
  if ($Run) {
    if ($BucketName -cnotmatch '^[a-zA-Z0-9-]{6,50}$' -or -not [IO.Path]::IsPathRooted($NodeExecutable)) { throw 'OPTIONS' }
    $stage='CONFIRMATION'
    if ((Read-Host 'Type LOCK ONE SYNTHETIC FILE FOR ONE DAY to proceed') -cne 'LOCK ONE SYNTHETIC FILE FOR ONE DAY') { throw 'DECLINED' }
  }
  $stage='LOCAL_PACKET'
  Add-Type -AssemblyName System.Security
  $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  $folder=Join-Path $repo ('.recovery-rehearsals/b2-owner-'+$RunId)
  foreach($directory in @($repo,(Join-Path $repo '.recovery-rehearsals'),$folder)) {
    $item=Get-Item -LiteralPath $directory -Force
    Assert-Safe ($item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
  }
  $receiptPath=Join-Path $folder 'retention-attempt.dpapi'
  if($Inspect){
    $saved=Read-Protected $receiptPath
    Assert-Safe ($saved.format -ceq 'biosphere-b2-retention-attempt-v1' -and $saved.runId -ceq $RunId -and @('intent','uploaded','verified','delete-succeeded') -ccontains $saved.state)
    $summary=@{code='B2_RETENTION_RECEIPT';state=$saved.state;uploadMayExist=$true;receiptRetained=$true;deploymentAuthorized=$false;unexpectedDeleteSucceeded=($saved.state -ceq 'delete-succeeded')}
    if($saved.state -ceq 'delete-succeeded'){
      Assert-Safe (@('publisher','deletionProbe') -ccontains $saved.deleteRole)
      $summary.deleteRole=$saved.deleteRole
    }
    $summary|ConvertTo-Json -Compress
    exit 0
  }
  # Any existing attempt is a hard stop, including damaged or incomplete files.
  if(Test-Path -LiteralPath $receiptPath){$uploadMayExist=$true;throw 'EXISTING_ATTEMPT'}
  $packet=Read-Protected (Join-Path $folder 'test-keys.dpapi')
  Assert-Safe ($packet.format -ceq 'biosphere-b2-test-keys-v1' -and $packet.runId -ceq $RunId -and $packet.bucketName -ceq $BucketName -and $packet.namePrefix -ceq ('synthetic/retention-'+$RunId+'/'))
  foreach($identifier in @($packet.accountId,$packet.bucketId)){Assert-Safe ($identifier -is [string] -and $identifier -cmatch '^[A-Za-z0-9_-]{1,128}$')}
  $base=@('listBuckets','readBucketRetentions','readFileRetentions','readFiles')
  $profiles=@{publisher=$base+@('writeFiles');fixtureWriter=$base+@('writeFiles','writeFileRetentions');deletionProbe=$base+@('deleteFiles')}
  $ids=@()
  foreach($role in @('publisher','fixtureWriter','deletionProbe')) {
    $key=$packet.keys.$role
    Assert-Capabilities $key.capabilities $profiles[$role]
    Assert-Safe ($key.applicationKeyId -is [string] -and $key.applicationKeyId -cmatch '^[A-Za-z0-9_-]{1,128}$' -and $ids -cnotcontains $key.applicationKeyId)
    Assert-Safe ($key.applicationKey -is [string] -and $key.applicationKey -cmatch '^[A-Za-z0-9_+/=.-]{8,256}$')
    $ids+=@($key.applicationKeyId)
    $remaining=[double]$key.expirationTimestamp-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Assert-Safe ($remaining -gt 600000 -and $remaining -le 21630000)
  }
  $stage='AUTHORIZATION';$sessions=@{}
  foreach($role in @('publisher','fixtureWriter','deletionProbe')) {
    $key=$packet.keys.$role
    $basic=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($key.applicationKeyId+':'+$key.applicationKey))
    $auth=Invoke-B2 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account' 'GET' @{Authorization='Basic '+$basic}
    $api=$auth.apiInfo.storageApi;$allowed=$api.allowed
    Assert-Safe ($auth.accountId -ceq $packet.accountId -and [double]$auth.applicationKeyExpirationTimestamp -eq [double]$key.expirationTimestamp)
    Assert-Safe ($auth.authorizationToken -is [string] -and $auth.authorizationToken.Length -gt 0 -and $auth.authorizationToken.Length -le 8192 -and $auth.authorizationToken -notmatch '[\r\n]')
    Assert-Safe ($api.apiUrl -cmatch '^https://api[0-9]+\.backblazeb2\.com/?$' -and $api.downloadUrl -cmatch '^https://f[0-9]+\.backblazeb2\.com/?$')
    Assert-Safe (@($allowed.buckets).Count -eq 1 -and $allowed.buckets[0].id -ceq $packet.bucketId -and $allowed.buckets[0].name -ceq $BucketName -and $allowed.namePrefix -ceq $packet.namePrefix)
    Assert-Capabilities $allowed.capabilities $profiles[$role]
    $sessions[$role]=@{api=$api.apiUrl.TrimEnd('/');download=$api.downloadUrl.TrimEnd('/');headers=@{Authorization=$auth.authorizationToken}}
  }
  $stage='BUCKET'
  $writer=$sessions.fixtureWriter
  $listed=Invoke-B2 ($writer.api+'/b2api/v4/b2_list_buckets') 'POST' $writer.headers (@{accountId=$packet.accountId;bucketId=$packet.bucketId}|ConvertTo-Json -Compress)
  Assert-Safe (@($listed.buckets).Count -eq 1)
  $bucket=$listed.buckets[0];$lock=$bucket.fileLockConfiguration
  Assert-Safe ($bucket.bucketId -ceq $packet.bucketId -and $bucket.bucketName -ceq $BucketName -and $bucket.bucketType -ceq 'allPrivate' -and @($bucket.lifecycleRules).Count -eq 0)
  Assert-Safe ($lock.isClientAuthorizedToRead -is [bool] -and $lock.isClientAuthorizedToRead -and $lock.value.isFileLockEnabled -is [bool] -and $lock.value.isFileLockEnabled -and $null -eq $lock.value.defaultRetention.mode -and $null -eq $lock.value.defaultRetention.period)
  $stage='FIXTURE'
  $fixture=Invoke-Codec @{command='create';runId=$RunId}
  $bytes=[Convert]::FromBase64String($fixture.envelope);Assert-Safe ($bytes.Length -gt 36 -and $bytes.Length -le 1024)
  $sha=[Security.Cryptography.SHA1]::Create()
  try{$sha1Hex=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  $receipt=@{format='biosphere-b2-retention-attempt-v1';runId=$RunId;state='intent';fileName=$packet.namePrefix+'probe.enc';fileId=$null;bucketId=$packet.bucketId;key=$fixture.key;sha256=$fixture.sha256;retainUntil=[DateTimeOffset]::UtcNow.AddHours(24).ToUnixTimeMilliseconds()}
  $stage='UPLOAD_URL'
  $url=Invoke-B2 ($writer.api+'/b2api/v4/b2_get_upload_url') 'POST' $writer.headers (@{bucketId=$packet.bucketId}|ConvertTo-Json -Compress)
  Assert-Safe ($url.bucketId -ceq $packet.bucketId)
  Assert-UploadUrl $url.uploadUrl
  Assert-Safe ($url.authorizationToken -is [string] -and $url.authorizationToken.Length -gt 0 -and $url.authorizationToken.Length -le 8192 -and $url.authorizationToken -notmatch '[\r\n]')
  $receipt.retainUntil=[DateTimeOffset]::UtcNow.AddHours(24).ToUnixTimeMilliseconds()
  $encodedName=($receipt.fileName.Split('/')|ForEach-Object {[Uri]::EscapeDataString($_)}) -join '/'
  $headers=@{Authorization=$url.authorizationToken;'X-Bz-File-Name'=$encodedName;'X-Bz-Content-Sha1'=$sha1Hex;'X-Bz-File-Retention-Mode'='governance';'X-Bz-File-Retention-Retain-Until-Timestamp'=[string]$receipt.retainUntil}
  # Reserve only after the read-only upload-URL lookup and validation succeed.
  # Exclusive creation still prevents two processes from sending the upload.
  $stage='RECEIPT';Write-Receipt -Create
  $stage='UPLOAD'
  $uploadMayExist=$true
  $response=Invoke-WebRequest -Uri $url.uploadUrl -Method Post -Headers $headers -Body $bytes -ContentType 'application/octet-stream' -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
  Assert-Safe ([int]$response.StatusCode -eq 200 -and $response.Content.Length -le 65536)
  $uploaded=$response.Content|ConvertFrom-Json -ErrorAction Stop
  Assert-File $uploaded
  $receipt.fileId=$uploaded.fileId;$receipt.state='uploaded';Write-Receipt
  $stage='VERSION_READ';Read-Version
  $stage='PUBLISHER_DELETE';Test-DeleteDenial 'publisher' 'unauthorized';Read-Version
  $stage='RETENTION_DELETE';Test-DeleteDenial 'deletionProbe' 'access_denied';Read-Version
  $receipt.state='verified';Write-Receipt
  @{code='B2_RETENTION_VERIFIED';deleteDenials=$denials;versionReads=$reads;receiptRetained=$true;deploymentAuthorized=$false}|ConvertTo-Json -Compress
  exit 0
} catch {
  $retained=($null -ne $receiptPath -and [IO.File]::Exists($receiptPath))
  @{code=$failureCode;stage=$stage;uploadMayExist=($uploadMayExist -or $retained);receiptRetained=$retained;deleteDenials=$denials;versionReads=$reads;failureLine=$_.InvocationInfo.ScriptLineNumber;deploymentAuthorized=$false} | ConvertTo-Json -Compress
  exit 1
} finally {
  $packet=$null;$sessions=$null;$key=$null;$basic=$null;$auth=$null;$fixture=$null;$receipt=$null;$headers=$null
}
