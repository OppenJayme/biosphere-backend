# Internal pipe-only helper. Never run it to display or copy credentials.
param([string]$RunId)
$ErrorActionPreference='Stop'
$VerbosePreference='SilentlyContinue'
$DebugPreference='SilentlyContinue'
$ProgressPreference='SilentlyContinue'
$PSModuleAutoLoadingPreference='None'
Set-StrictMode -Version Latest
function Assert-Packet([bool]$Condition){if(-not $Condition){throw 'PACKET_REJECTED'}}
$clear=$null;$packet=$null;$selected=$null
try{
 Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop
 Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1')) -ErrorAction Stop
 Assert-Packet ([Console]::IsOutputRedirected -and [Console]::IsInputRedirected)
 Assert-Packet ($RunId -cmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 $handshake=[Console]::In.ReadLine()
 Assert-Packet ($handshake -is [string] -and $handshake -cmatch '^BIOSPHERE_OWNER_PIPE_V1:([a-f0-9]{64})$')
 $nonce=$Matches[1]
 Add-Type -AssemblyName System.Security
 if(-not ('Security.Cryptography.ProtectedData' -as [type])){Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop}
 $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
 $private=Join-Path $root '.recovery-rehearsals'
 $owner=Join-Path $private ('b2-owner-'+$RunId)
 foreach($folder in @($root,$private,$owner)){
  $item=Get-Item -LiteralPath $folder -Force -ErrorAction Stop
  Assert-Packet ($item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
 }
 $path=Join-Path $owner 'test-keys.dpapi'
 $file=Get-Item -LiteralPath $path -Force -ErrorAction Stop
 Assert-Packet (-not $file.PSIsContainer -and -not ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $file.Length -gt 0 -and $file.Length -le 65536)
 $clear=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($path),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 $packet=[Text.Encoding]::UTF8.GetString($clear)|ConvertFrom-Json -ErrorAction Stop
 Assert-Packet ($packet.format -ceq 'biosphere-b2-test-keys-v1' -and $packet.runId -ceq $RunId -and $packet.namePrefix -ceq ('synthetic/retention-'+$RunId+'/'))
 foreach($name in @('accountId','bucketId')){Assert-Packet ($packet.$name -is [string] -and $packet.$name -cmatch '^[A-Za-z0-9_-]{1,128}$')}
 Assert-Packet ($packet.bucketName -is [string] -and $packet.bucketName -cmatch '^[A-Za-z0-9][A-Za-z0-9-]{4,61}[A-Za-z0-9]$')
 $base=@('listBuckets','readBucketRetentions','readFileRetentions','readFiles')
 $profiles=@{publisher=$base+@('writeFiles');fixtureWriter=$base+@('writeFiles','writeFileRetentions');deletionProbe=$base+@('deleteFiles')}
 Assert-Packet (@($packet.keys.PSObject.Properties).Count -eq 3)
 $ids=@()
 foreach($role in @('publisher','fixtureWriter','deletionProbe')){
  $key=$packet.keys.$role
  Assert-Packet (@($key.capabilities).Count -eq $profiles[$role].Count)
  foreach($cap in $profiles[$role]){Assert-Packet (@($key.capabilities) -ccontains $cap)}
  Assert-Packet ($key.applicationKeyId -is [string] -and $key.applicationKeyId -cmatch '^[A-Za-z0-9_-]{8,128}$' -and $ids -cnotcontains $key.applicationKeyId)
  Assert-Packet ($key.applicationKey -is [string] -and $key.applicationKey -cmatch '^[A-Za-z0-9_+/=.-]{8,256}$')
  $remaining=[double]$key.expirationTimestamp-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  Assert-Packet ($remaining -gt 600000 -and $remaining -le 21630000)
  $ids+=@($key.applicationKeyId)
 }
 $selected=$packet.keys.fixtureWriter
 $result=@{format='biosphere-owner-session-input-v1';role='fixtureWriter';nonce=$nonce;target=@{accountId=$packet.accountId;bucketId=$packet.bucketId;bucketName=$packet.bucketName;runId=$RunId;namePrefix=$packet.namePrefix};key=@{applicationKeyId=$selected.applicationKeyId;applicationKey=$selected.applicationKey;capabilities=@($selected.capabilities);expirationTimestamp=$selected.expirationTimestamp}}
 [Console]::Out.Write(($result|ConvertTo-Json -Depth 8 -Compress))
 exit 0
}catch{
 [Console]::Error.Write('B2_DPAPI_READ_FAILED')
 exit 1
}finally{
 if($null -ne $clear){[Array]::Clear($clear,0,$clear.Length)}
 $packet=$null;$selected=$null;$result=$null;$key=$null
}
