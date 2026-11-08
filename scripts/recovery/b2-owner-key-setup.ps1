param([string]$BucketName, [switch]$Create, [switch]$Inspect, [string]$RunId)
$ErrorActionPreference = 'Stop'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
$setupBaseCapabilities = @('listBuckets','readBucketRetentions','readFileRetentions','readFiles')
$setupProfiles = [ordered]@{
  publisher = @($setupBaseCapabilities + 'writeFiles')
  fixtureWriter = @($setupBaseCapabilities + @('writeFiles','writeFileRetentions'))
  deletionProbe = @($setupBaseCapabilities + 'deleteFiles')
}
if (-not $Create -and -not $Inspect) {
  $setupPlan = @($setupProfiles.Keys | ForEach-Object { @{ role = $_; capabilities = $setupProfiles[$_]; validDurationInSeconds = 21600 } })
  @{ code = 'B2_OWNER_SETUP_PLAN'; liveChanges = $false; plannedKeys = $setupPlan; bucketMustBePrivate = $true; objectLockMustBeEnabled = $true; defaultRetentionMustBeUnset = $true } | ConvertTo-Json -Depth 8 -Compress
  exit 0
}
$setupStage = 'CONFIGURATION'
$setupCreatedCount = 0
$setupCreationUnknown = $false
$setupState = $null
$setupRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.recovery-rehearsals'))
function Assert-Setup($Condition) { if (-not $Condition) { throw 'SETUP_STOPPED' } }
function Get-SetupPlaintext([Security.SecureString]$Value) {
  $setupPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupPointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupPointer); $Value.Dispose() }
}
function Save-SetupPacket {
  $setupBytes = [Text.Encoding]::UTF8.GetBytes(($setupState | ConvertTo-Json -Depth 12 -Compress))
  $setupProtected = [Security.Cryptography.ProtectedData]::Protect($setupBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($setupPacket, $setupProtected)
}
try {
  Assert-Setup ($env:OS -eq 'Windows_NT' -or [Environment]::OSVersion.Platform -eq 'Win32NT')
  Add-Type -AssemblyName System.Security
  Assert-Setup (-not ($Create -and $Inspect))
  if ($Inspect) {
    Assert-Setup ($RunId -cmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
    $setupPacket = Join-Path (Join-Path $setupRoot ('b2-owner-' + $RunId)) 'test-keys.dpapi'
    $setupItem = Get-Item -LiteralPath $setupPacket
    Assert-Setup (-not $setupItem.PSIsContainer -and -not ($setupItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -and $setupItem.Length -le 65536)
    $setupPlain = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($setupPacket), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    $setupSaved = [Text.Encoding]::UTF8.GetString($setupPlain) | ConvertFrom-Json
    Assert-Setup ($setupSaved.format -eq 'biosphere-b2-test-keys-v1' -and $setupSaved.runId -eq $RunId)
    $setupRoles = @{}
    foreach ($setupProperty in $setupSaved.keys.PSObject.Properties) {
      $setupRoles[$setupProperty.Name] = @{ capabilities = @($setupProperty.Value.capabilities); expiresAt = $setupProperty.Value.expirationTimestamp }
    }
    @{ code = 'B2_TEST_KEYS_METADATA'; createdCount = $setupRoles.Count; roles = $setupRoles } | ConvertTo-Json -Depth 8 -Compress
    exit 0
  }
  Assert-Setup ($BucketName -cmatch '^[A-Za-z0-9][A-Za-z0-9-]{4,61}[A-Za-z0-9]$' -and -not $RunId)
  $setupStage = 'OWNER_CONFIRMATION'
  Assert-Setup ((Read-Host 'Type CREATE THREE TEST KEYS to create only the scoped six-hour test keys') -ceq 'CREATE THREE TEST KEYS')
  $setupAdminId = Get-SetupPlaintext (Read-Host 'Administrative key ID' -AsSecureString)
  $setupAdminSecret = Get-SetupPlaintext (Read-Host 'Administrative application key' -AsSecureString)
  Assert-Setup ($setupAdminId -cmatch '^[A-Za-z0-9_-]{8,128}$' -and $setupAdminSecret -cmatch '^[A-Za-z0-9_+/=.-]{8,256}$')
  $setupStage = 'AUTHORIZE'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $setupBasic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($setupAdminId + ':' + $setupAdminSecret))
  $setupAuth = Invoke-RestMethod -Uri 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account' -Method Get -Headers @{Authorization = 'Basic ' + $setupBasic} -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
  $setupAdminSecret = $null; $setupBasic = $null; $setupAdminId = $null
  Assert-Setup ($setupAuth.accountId -is [string] -and $setupAuth.authorizationToken -is [string] -and $setupAuth.authorizationToken.Length -gt 0 -and $setupAuth.authorizationToken.Length -le 8192 -and $setupAuth.authorizationToken -notmatch '[\r\n]')
  $setupApi = $setupAuth.apiInfo.storageApi
  Assert-Setup ($setupApi.apiUrl -is [string] -and $setupApi.apiUrl -cmatch '^https://api[0-9]+\.backblazeb2\.com/?$')
  foreach ($setupRequired in @('writeKeys','listBuckets','readBucketRetentions')) { Assert-Setup ($setupApi.allowed.capabilities -contains $setupRequired) }
  $setupApiRoot = $setupApi.apiUrl.TrimEnd('/')
  $setupHeaders = @{ Authorization = $setupAuth.authorizationToken; 'Content-Type' = 'application/json' }
  $setupStage = 'TARGET_CHECK'
  $setupListed = Invoke-RestMethod -Uri ($setupApiRoot + '/b2api/v4/b2_list_buckets') -Method Post -Headers $setupHeaders -Body (@{accountId = $setupAuth.accountId; bucketName = $BucketName} | ConvertTo-Json -Compress) -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
  Assert-Setup (@($setupListed.buckets).Count -eq 1)
  $setupBucket = $setupListed.buckets[0]
  Assert-Setup ($setupBucket.bucketName -is [string] -and $setupBucket.accountId -is [string] -and $setupBucket.bucketType -is [string] -and $setupBucket.bucketName -ceq $BucketName -and $setupBucket.accountId -ceq $setupAuth.accountId -and $setupBucket.bucketType -ceq 'allPrivate')
  Assert-Setup ($setupBucket.bucketId -is [string] -and $setupBucket.bucketId -cmatch '^[a-zA-Z0-9]{16,64}$' -and @($setupBucket.lifecycleRules).Count -eq 0)
  Assert-Setup ($setupBucket.fileLockConfiguration.isClientAuthorizedToRead -is [bool] -and $setupBucket.fileLockConfiguration.isClientAuthorizedToRead -eq $true -and $setupBucket.fileLockConfiguration.value.isFileLockEnabled -is [bool] -and $setupBucket.fileLockConfiguration.value.isFileLockEnabled -eq $true -and $null -eq $setupBucket.fileLockConfiguration.value.defaultRetention.mode)
  $setupStage = 'LOCAL_STORAGE'
  if (Test-Path -LiteralPath $setupRoot) { Assert-Setup (-not ((Get-Item -LiteralPath $setupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) }
  else { New-Item -ItemType Directory -Path $setupRoot | Out-Null }
  $RunId = [Guid]::NewGuid().ToString()
  $setupFolder = Join-Path $setupRoot ('b2-owner-' + $RunId)
  Assert-Setup (-not (Test-Path -LiteralPath $setupFolder))
  New-Item -ItemType Directory -Path $setupFolder | Out-Null
  $setupPacket = Join-Path $setupFolder 'test-keys.dpapi'
  $setupPrefix = 'synthetic/retention-' + $RunId + '/'
  $setupState = @{ format = 'biosphere-b2-test-keys-v1'; runId = $RunId; accountId = $setupAuth.accountId; bucketId = $setupBucket.bucketId; bucketName = $BucketName; namePrefix = $setupPrefix; keys = @{} }
  Save-SetupPacket
  foreach ($setupRole in $setupProfiles.Keys) {
    $setupStage = 'CREATE_' + $setupRole
    $setupRequest = @{ accountId = $setupAuth.accountId; keyName = 'biosphere-test-' + $setupRole + '-' + $RunId; capabilities = $setupProfiles[$setupRole]; bucketIds = @($setupBucket.bucketId); namePrefix = $setupPrefix; validDurationInSeconds = 21600 }
    $setupCreationUnknown = $true
    $setupCreated = Invoke-RestMethod -Uri ($setupApiRoot + '/b2api/v4/b2_create_key') -Method Post -Headers $setupHeaders -Body ($setupRequest | ConvertTo-Json -Depth 5 -Compress) -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction Stop
    $setupStage = 'VERIFY_RETURNED_' + $setupRole
    Assert-Setup ($setupCreated.keyName -ceq $setupRequest.keyName -and @($setupCreated.bucketIds).Count -eq 1 -and $setupCreated.bucketIds[0] -ceq $setupBucket.bucketId -and $setupCreated.namePrefix -ceq $setupPrefix)
    Assert-Setup (@($setupCreated.capabilities).Count -eq $setupProfiles[$setupRole].Count)
    foreach ($setupCapability in $setupProfiles[$setupRole]) { Assert-Setup (@($setupCreated.capabilities) -ccontains $setupCapability) }
    Assert-Setup ($setupCreated.applicationKeyId -is [string] -and $setupCreated.applicationKey -is [string] -and $setupCreated.applicationKeyId -cmatch '^[A-Za-z0-9_-]{8,128}$' -and $setupCreated.applicationKey -cmatch '^[A-Za-z0-9_+/=.-]{8,256}$')
    foreach ($setupPrevious in $setupState.keys.Values) { Assert-Setup ($setupCreated.applicationKeyId -cne $setupPrevious.applicationKeyId) }
    $setupRemaining = [double]$setupCreated.expirationTimestamp - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Assert-Setup ($setupRemaining -gt 0 -and $setupRemaining -le 21630000)
    $setupState.keys[$setupRole] = @{ applicationKeyId = $setupCreated.applicationKeyId; applicationKey = $setupCreated.applicationKey; keyName = $setupCreated.keyName; capabilities = @($setupCreated.capabilities); expirationTimestamp = $setupCreated.expirationTimestamp }
    Save-SetupPacket
    $setupCreatedCount++; $setupCreationUnknown = $false
  }
  @{ code = 'B2_TEST_KEYS_CREATED'; createdCount = $setupCreatedCount; runId = $RunId; protectedForCurrentWindowsUser = $true; bucketSettingsChanged = $false } | ConvertTo-Json -Compress
  exit 0
} catch {
  @{ code = 'B2_OWNER_SETUP_STOPPED'; stage = $setupStage; createdCount = $setupCreatedCount; creationOutcomeUnknown = $setupCreationUnknown; runId = $RunId; failureLine = $_.InvocationInfo.ScriptLineNumber } | ConvertTo-Json -Compress
  exit 1
} finally {
  $setupAdminSecret = $null; $setupAdminId = $null; $setupBasic = $null; $setupAuth = $null; $setupHeaders = $null; $setupCreated = $null; $setupState = $null
}
