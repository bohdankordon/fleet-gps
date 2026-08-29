[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'status', 'stop', 'destroy', 'reset', 'migrate', 'test', 'api-test', 'validate', 'api-typecheck', 'api-full-test')]
    [string]$Action = 'status',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RunnerArguments = @()
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot 'compose.test.yaml'
$ProjectName = 'taxi-gps-test'
$ServiceName = 'postgres-test'
$RunnerServiceName = 'api-db-test-runner'
$TestPort = 5434
$TestDatabaseUrl = 'postgresql://taxi_gps_test:taxi_gps_test_local_only@127.0.0.1:5434/taxi_gps_test?schema=public'
$TestEnvironment = @{
    DATABASE_URL = $TestDatabaseUrl
    TEST_DATABASE = '1'
    SYNC_SCHEDULER_ENABLED = 'false'
    ALERT_INGESTION_ENABLED = 'false'
    POSITION_HISTORY_MAINTENANCE_ENABLED = 'false'
    POSITION_HISTORY_RETENTION_ENABLED = 'false'
    TELEGRAM_NOTIFICATIONS_ENABLED = 'false'
    TELEGRAM_PRODUCT_LINKING_ENABLED = 'false'
    TELEGRAM_PER_USER_NOTIFICATIONS_ENABLED = 'false'
    TELEGRAM_PER_USER_DISPATCH_ENABLED = 'false'
    OPS_ALERTS_ENABLED = 'false'
}

function Invoke-NativeExecutable {
    param([Parameter(Mandatory = $true)][string]$FilePath, [string[]]$Arguments = @())

    $executable = @(Get-Command $FilePath -CommandType Application -ErrorAction Stop)[0].Source
    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = $null
    try {
        # Native stderr is normal for Docker status output in Windows PowerShell.
        $ErrorActionPreference = 'Continue'
        $output = & $executable @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousErrorActionPreference }
    if ($null -eq $exitCode) { throw "$FilePath did not return an exit code." }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = @($output | ForEach-Object { $_.ToString() }) }
}

function Invoke-CheckedNative {
    param([Parameter(Mandatory = $true)][string]$FilePath, [string[]]$Arguments = @())
    $result = Invoke-NativeExecutable -FilePath $FilePath -Arguments $Arguments
    if ($result.ExitCode -ne 0) { throw "$FilePath failed: $($result.Output -join [Environment]::NewLine)" }
    return $result.Output
}

function Invoke-TestEnvironment {
    param([Parameter(Mandatory = $true)][scriptblock]$Command)
    $previous = @{}
    foreach ($key in $TestEnvironment.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        Set-Item -Path "Env:$key" -Value $TestEnvironment[$key]
    }
    try { & $Command } finally {
        foreach ($key in $TestEnvironment.Keys) {
            if ($null -eq $previous[$key]) { Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue }
            else { Set-Item -Path "Env:$key" -Value $previous[$key] }
        }
    }
}

function Assert-TestTarget {
    Invoke-TestEnvironment { Invoke-CheckedNative -FilePath 'node.exe' -Arguments @('apps/api/scripts/assert-test-database-url.cjs') | ForEach-Object { Write-Host $_ } }
}

function Invoke-TestCompose {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    Invoke-CheckedNative -FilePath 'docker.exe' -Arguments (@('compose', '--project-name', $ProjectName, '-f', $ComposeFile) + $Arguments)
}

function Get-TestPostgresStatus {
    $result = Invoke-NativeExecutable -FilePath 'docker.exe' -Arguments @('compose', '--project-name', $ProjectName, '-f', $ComposeFile, 'ps', '--format', 'json', $ServiceName)
    if ($result.ExitCode -ne 0) { throw "Docker Compose status failed: $($result.Output -join [Environment]::NewLine)" }
    if ($result.Output.Count -eq 0) { return [pscustomobject]@{ State = 'stopped'; Health = '' } }
    $container = ($result.Output -join [Environment]::NewLine) | ConvertFrom-Json
    return [pscustomobject]@{ State = [string]$container.State; Health = [string]$container.Health }
}

function Start-TestPostgres {
    Assert-TestTarget
    Invoke-TestCompose -Arguments @('up', '-d', $ServiceName) | ForEach-Object { Write-Host $_ }
    $deadline = [DateTime]::UtcNow.AddSeconds(75)
    do {
        $status = Get-TestPostgresStatus
        if ($status.State -eq 'running' -and $status.Health -eq 'healthy') {
            Write-Host "Isolated test PostgreSQL is running/healthy on 127.0.0.1:$TestPort."
            return
        }
        if ($status.Health -eq 'unhealthy') { throw 'Isolated test PostgreSQL reported unhealthy.' }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Isolated test PostgreSQL did not become healthy within 75 seconds.'
}

function Invoke-TestMigration {
    Assert-TestTarget
    Invoke-TestRunner -Arguments @('migrate')
}

function Invoke-TestRunner {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    Assert-TestTarget
    Invoke-TestCompose -Arguments (@('run', '--rm', '--no-deps', '--build', $RunnerServiceName) + $Arguments) | ForEach-Object { Write-Host $_ }
}

function Destroy-TestPostgres {
    Assert-TestTarget
    Invoke-TestCompose -Arguments @('down', '--volumes', '--remove-orphans') | ForEach-Object { Write-Host $_ }
    Write-Host 'Destroyed only the isolated taxi-gps-test containers and test volume.'
}

function Reset-TestPostgres {
    Assert-TestTarget
    Destroy-TestPostgres
    Start-TestPostgres
    Invoke-TestMigration
}

function Invoke-TestSuite {
    # A smoke run always proves the migration chain from an empty test volume.
    Reset-TestPostgres
    Invoke-TestRunner -Arguments @('smoke')
}

Set-Location -LiteralPath $RepoRoot
switch ($Action) {
    'start' { Start-TestPostgres }
    'status' {
        $status = Get-TestPostgresStatus
        Write-Host "Isolated test PostgreSQL: $($status.State)$($(if ($status.Health) { "/$($status.Health)" } else { '' }))"
        Write-Host "Project: $ProjectName; service: $ServiceName; database: taxi_gps_test; host: 127.0.0.1:$TestPort"
        Write-Host 'Development PostgreSQL remains the separate compose.yaml project on 127.0.0.1:5433.'
    }
    'stop' { Invoke-TestCompose -Arguments @('stop', $ServiceName) | ForEach-Object { Write-Host $_ }; Write-Host 'Isolated test PostgreSQL stopped; its test-only volume was preserved.' }
    'destroy' { Destroy-TestPostgres }
    'reset' { Reset-TestPostgres }
    'migrate' { Start-TestPostgres; Invoke-TestMigration }
    'test' { Invoke-TestSuite }
    'api-test' { Start-TestPostgres; Invoke-TestMigration; Invoke-TestRunner -Arguments (@('api-test') + $RunnerArguments) }
    'validate' { Start-TestPostgres; Invoke-TestRunner -Arguments @('validate') }
    'api-typecheck' { Start-TestPostgres; Invoke-TestRunner -Arguments @('api-typecheck') }
    'api-full-test' { Start-TestPostgres; Invoke-TestRunner -Arguments @('api-full-test') }
}
