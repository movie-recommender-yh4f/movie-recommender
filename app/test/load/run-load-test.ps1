[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    'smoke',
    'browse',
    'authenticated',
    'movie-details-cache',
    'rate-limits',
    'mixed-workload',
    'spike',
    'stress',
    'stress-authenticated',
    'stress-mixed',
    'soak',
    'recommendations-mock',
    'recommendations-real',
    'signup-smoke',
    'browser-smoke'
  )]
  [string]$Scenario
)

$ErrorActionPreference = 'Stop'

$scenarioFiles = @{
  'smoke' = 'smoke.js'
  'browse' = 'browse.js'
  'authenticated' = 'authenticated.js'
  'movie-details-cache' = 'movie-details-cache.js'
  'rate-limits' = 'rate-limits.js'
  'mixed-workload' = 'mixed-workload.js'
  'spike' = 'spike.js'
  'stress' = 'stress.js'
  'stress-authenticated' = 'stress-authenticated.js'
  'stress-mixed' = 'stress-mixed.js'
  'soak' = 'soak.js'
  'recommendations-mock' = 'recommendations-mock.js'
  'recommendations-real' = 'recommendations-real.js'
  'signup-smoke' = 'signup-smoke.js'
  'browser-smoke' = 'browser-smoke.js'
}

if (-not $env:BASE_URL) {
  throw 'BASE_URL is required.'
}

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  throw 'k6 is not installed or is not available on PATH.'
}

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gitRoot = (Resolve-Path (Join-Path $appRoot '..')).Path
$gitSafeDirectory = $gitRoot.Replace('\', '/')
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$resultDirectory = Join-Path $PSScriptRoot ('results\' + $timestamp + '-' + $Scenario)
$scriptPath = Join-Path $PSScriptRoot ('scenarios\' + $scenarioFiles[$Scenario])
$summaryPath = Join-Path $resultDirectory 'summary.json'
$rawMetricsPath = Join-Path $resultDirectory 'metrics.json'
$consolePath = Join-Path $resultDirectory 'console.txt'
$metadataPath = Join-Path $resultDirectory 'metadata.json'

New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null

$gitCommit = (
  & git -c ('safe.directory=' + $gitSafeDirectory) -C $gitRoot rev-parse HEAD
).Trim()

$metadata = [ordered]@{
  scenario = $Scenario
  startedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  baseUrl = $env:BASE_URL
  applicationGitCommit = $gitCommit
  testScriptGitCommit = $gitCommit
  deploymentEnvironment = $env:NUXT_LOAD_TEST_ENVIRONMENT
  deploymentRegion = $env:DEPLOYMENT_REGION
  loadGeneratorRegion = $env:LOAD_GENERATOR_REGION
  vercelPlan = $env:VERCEL_PLAN
  supabasePlan = $env:SUPABASE_PLAN
  redisPlan = $env:REDIS_PLAN
  providerModeExpected = $env:EXPECTED_AI_PROVIDER_MODE
  mockScenarioExpected = $env:EXPECTED_MOCK_SCENARIO
  cacheState = $env:CACHE_STATE_NOTES
  workloadAssumptions = $env:TEST_ASSUMPTIONS
}

$metadata |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath $metadataPath -Encoding utf8

$arguments = @(
  'run',
  '--summary-export', $summaryPath,
  '--out', ('json=' + $rawMetricsPath),
  $scriptPath
)

& k6 @arguments 2>&1 | Tee-Object -FilePath $consolePath
$exitCode = $LASTEXITCODE

$metadata.finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
$metadata.k6ExitCode = $exitCode
$metadata |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath $metadataPath -Encoding utf8

Write-Host ('Results saved to ' + $resultDirectory)
exit $exitCode
