[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$RuntimeDirectory = Join-Path $RepoRoot '.dev-runtime'
$ApiPort = 3000
$WebPort = 3001
$PostgresService = 'postgres'

$ProcessSettings = @{
    api = @{
        DisplayName = 'API'
        Port = $ApiPort
        PidFile = Join-Path $RuntimeDirectory 'api.pid'
        LauncherFile = Join-Path $RuntimeDirectory 'api-launch.ps1'
    }
    web = @{
        DisplayName = 'Web'
        Port = $WebPort
        PidFile = Join-Path $RuntimeDirectory 'web.pid'
        LauncherFile = Join-Path $RuntimeDirectory 'web-launch.ps1'
    }
}

function Remove-RuntimeState {
    param([Parameter(Mandatory = $true)][hashtable]$Settings)

    Remove-Item -LiteralPath $Settings.PidFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Settings.LauncherFile -Force -ErrorAction SilentlyContinue
}

function Get-ManagedProcess {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Settings,
        [switch]$CleanStale
    )

    if (-not (Test-Path -LiteralPath $Settings.PidFile -PathType Leaf)) {
        return $null
    }

    try {
        $record = Get-Content -Raw -LiteralPath $Settings.PidFile | ConvertFrom-Json
        $processId = [int]$record.pid
        if ($processId -le 0 -or [string]$record.launcher -ne $Settings.LauncherFile) {
            throw 'Invalid managed-process record.'
        }

        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
        if ($null -eq $process) {
            throw 'The saved process no longer exists.'
        }

        $expectedNames = @('powershell.exe', 'pwsh.exe')
        $commandLine = [string]$process.CommandLine
        if (($expectedNames -notcontains ([string]$process.Name).ToLowerInvariant()) -or
            $commandLine.IndexOf($Settings.LauncherFile, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw 'The saved PID belongs to a different process.'
        }

        return [pscustomobject]@{
            Id = $processId
            Process = $process
        }
    }
    catch {
        if ($CleanStale) {
            Write-Host "Removing stale $($Settings.DisplayName) runtime state."
            Remove-RuntimeState -Settings $Settings
        }
        return $null
    }
}

function Get-PortListeners {
    param([Parameter(Mandatory = $true)][int]$Port)

    try {
        return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
    }
    catch [Microsoft.PowerShell.Cmdletization.Cim.CimJobException] {
        return @()
    }
    catch {
        if ($_.FullyQualifiedErrorId -like 'NoMatchingMSFT_NetTCPConnection*') {
            return @()
        }
        throw "Unable to check local port $Port. $($_.Exception.Message)"
    }
}

function Assert-PortAvailable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $listeners = @(Get-PortListeners -Port $Port)
    if ($listeners.Count -gt 0) {
        $ownerIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
        throw "$Name cannot start: local port $Port is already occupied by unmanaged process PID(s): $($ownerIds -join ', '). No process was killed."
    }
}

function Write-Launcher {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('api', 'web')][string]$Name,
        [Parameter(Mandatory = $true)][hashtable]$Settings
    )

    $escapedRoot = $RepoRoot.Replace("'", "''")
    if ($Name -eq 'api') {
        $environmentOverrides = @'
$env:SYNC_SCHEDULER_ENABLED = 'false'
$env:ALERT_INGESTION_ENABLED = 'false'
$env:POSITION_HISTORY_MAINTENANCE_ENABLED = 'false'
$env:POSITION_HISTORY_RETENTION_ENABLED = 'false'
$env:POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED = 'false'
$env:TELEGRAM_NOTIFICATIONS_ENABLED = 'false'
$env:OPS_ALERTS_ENABLED = 'false'
'@
        $environmentOverrides += "`n`$env:PORT = '$ApiPort'"
        $npmArguments = "@('run', 'api:dev')"
        $title = 'taxi-gps API development'
    }
    else {
        $environmentOverrides = "`$env:API_INTERNAL_BASE_URL = 'http://127.0.0.1:$ApiPort'"
        $npmArguments = "@('--workspace', '@taxi-gps/web', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '$WebPort')"
        $title = 'taxi-gps Web development'
    }

    $launcher = @"
`$ErrorActionPreference = 'Stop'
`$repoRoot = '$escapedRoot'
`$envFile = Join-Path `$repoRoot '.env'
Set-Location -LiteralPath `$repoRoot
try { `$Host.UI.RawUI.WindowTitle = '$title' } catch {}
$environmentOverrides
`$npmArguments = $npmArguments
`$nodeRunner = "const { spawnSync } = require('node:child_process'); const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...process.argv.slice(1)], { stdio: 'inherit', shell: false }); process.exit(result.status === null ? 1 : result.status);"
`$previousErrorActionPreference = `$ErrorActionPreference
try {
    `$ErrorActionPreference = 'Continue'
    & node.exe "--env-file=`$envFile" -e `$nodeRunner -- @npmArguments
    `$nodeExitCode = `$LASTEXITCODE
}
finally {
    `$ErrorActionPreference = `$previousErrorActionPreference
}
if (`$null -eq `$nodeExitCode) { throw 'Node.js did not return an exit code.' }
exit `$nodeExitCode
"@

    Set-Content -LiteralPath $Settings.LauncherFile -Value $launcher -Encoding UTF8
}

function Start-ManagedProcess {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('api', 'web')][string]$Name,
        [Parameter(Mandatory = $true)][hashtable]$Settings
    )

    Write-Launcher -Name $Name -Settings $Settings
    try {
        $process = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', ('"{0}"' -f $Settings.LauncherFile)
        ) -WorkingDirectory $RepoRoot -PassThru

        @{
            pid = $process.Id
            launcher = $Settings.LauncherFile
            createdUtc = [DateTime]::UtcNow.ToString('o')
        } | ConvertTo-Json | Set-Content -LiteralPath $Settings.PidFile -Encoding ASCII
    }
    catch {
        Remove-RuntimeState -Settings $Settings
        throw "Failed to launch $($Settings.DisplayName). $($_.Exception.Message)"
    }

    $readinessTimeoutSeconds = 300
    $deadline = [DateTime]::UtcNow.AddSeconds($readinessTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        if ($process.HasExited) {
            Remove-RuntimeState -Settings $Settings
            throw "$($Settings.DisplayName) exited before listening on port $($Settings.Port). Review its terminal output."
        }
        if (@(Get-PortListeners -Port $Settings.Port).Count -gt 0) {
            Write-Host "$($Settings.DisplayName) started (managed PID $($process.Id))."
            return
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "$($Settings.DisplayName) process PID $($process.Id) did not listen on port $($Settings.Port) within $readinessTimeoutSeconds seconds. It remains managed and can be stopped with '.\dev.ps1 stop'."
}

function Stop-ManagedProcess {
    param([Parameter(Mandatory = $true)][hashtable]$Settings)

    $managed = Get-ManagedProcess -Settings $Settings -CleanStale
    if ($null -eq $managed) {
        Write-Host "$($Settings.DisplayName) is stopped."
        return
    }

    $result = Invoke-NativeExecutable -FilePath 'taskkill.exe' -Arguments @('/PID', $managed.Id, '/T', '/F')
    if ($result.ExitCode -ne 0) {
        throw "Failed to stop the managed $($Settings.DisplayName) process tree (PID $($managed.Id)): $($result.Output -join [Environment]::NewLine)"
    }
    Remove-RuntimeState -Settings $Settings
    Write-Host "$($Settings.DisplayName) stopped."
}

function Invoke-NativeExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    $executable = (Get-Command $FilePath -CommandType Application -ErrorAction Stop).Source
    $previousErrorActionPreference = $ErrorActionPreference
    $exitCode = $null
    try {
        # Windows PowerShell 5.1 can promote redirected native stderr to a
        # NativeCommandError. Native exit codes remain authoritative here.
        $ErrorActionPreference = 'Continue'
        $output = & $executable @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($null -eq $exitCode) {
        throw "$FilePath did not return an exit code."
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = @($output | ForEach-Object { $_.ToString() })
    }
}

function Invoke-Compose {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $result = Invoke-NativeExecutable -FilePath 'docker.exe' -Arguments (@('compose') + $Arguments)
    if ($result.ExitCode -ne 0) {
        throw "Docker Compose failed: $($result.Output -join [Environment]::NewLine)"
    }
    return $result.Output
}

function Get-PostgresStatus {
    $output = Invoke-Compose -Arguments @('ps', '--format', 'json', $PostgresService)
    if ($output.Count -eq 0) {
        return [pscustomobject]@{ State = 'stopped'; Health = '' }
    }

    $container = ($output -join [Environment]::NewLine) | ConvertFrom-Json
    return [pscustomobject]@{
        State = [string]$container.State
        Health = [string]$container.Health
    }
}

function Start-Postgres {
    Invoke-Compose -Arguments @('up', '-d', $PostgresService) | ForEach-Object { Write-Host $_ }

    $deadline = [DateTime]::UtcNow.AddSeconds(75)
    do {
        $status = Get-PostgresStatus
        if ($status.State -eq 'running' -and ($status.Health -eq '' -or $status.Health -eq 'healthy')) {
            Write-Host "PostgreSQL is $($status.State)$($(if ($status.Health) { "/$($status.Health)" } else { '' }))."
            return
        }
        if ($status.Health -eq 'unhealthy') {
            throw 'PostgreSQL reported an unhealthy state.'
        }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)

    throw 'PostgreSQL did not become ready within 75 seconds.'
}

function Show-Status {
    foreach ($name in @('api', 'web')) {
        $settings = $ProcessSettings[$name]
        $managed = Get-ManagedProcess -Settings $settings
        if ($null -ne $managed) {
            Write-Host "$($settings.DisplayName): RUNNING (managed PID $($managed.Id))"
        }
        else {
            Write-Host "$($settings.DisplayName): STOPPED"
        }
    }

    try {
        $postgres = Get-PostgresStatus
        $postgresText = $postgres.State
        if ($postgres.Health) {
            $postgresText = "$postgresText/$($postgres.Health)"
        }
        Write-Host "PostgreSQL: $postgresText"
    }
    catch {
        Write-Host "PostgreSQL: unavailable ($($_.Exception.Message))"
    }

    Write-Host ''
    Write-Host "Web: http://127.0.0.1:$WebPort"
    Write-Host "API: http://127.0.0.1:$ApiPort"
}

Set-Location -LiteralPath $RepoRoot

switch ($Action) {
    'start' {
        New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null

        $managedProcesses = @{}
        foreach ($name in @('api', 'web')) {
            $settings = $ProcessSettings[$name]
            $managedProcesses[$name] = Get-ManagedProcess -Settings $settings -CleanStale
            if ($null -eq $managedProcesses[$name]) {
                Assert-PortAvailable -Name $settings.DisplayName -Port $settings.Port
            }
        }

        Start-Postgres

        foreach ($name in @('api', 'web')) {
            $settings = $ProcessSettings[$name]
            if ($null -ne $managedProcesses[$name]) {
                Write-Host "$($settings.DisplayName) is already running (managed PID $($managedProcesses[$name].Id))."
            }
            else {
                Start-ManagedProcess -Name $name -Settings $settings
            }
        }

        Write-Host ''
        Write-Host 'Development environment started.'
        Write-Host ''
        Write-Host "Web: http://127.0.0.1:$WebPort"
        Write-Host "API: http://127.0.0.1:$ApiPort"
        Write-Host 'Background schedulers/provider/Telegram jobs: forced OFF'
    }
    'stop' {
        Stop-ManagedProcess -Settings $ProcessSettings.web
        Stop-ManagedProcess -Settings $ProcessSettings.api
        Invoke-Compose -Arguments @('stop', $PostgresService) | ForEach-Object { Write-Host $_ }
        Write-Host 'PostgreSQL stopped; its named data volume was preserved.'
    }
    'status' {
        Show-Status
    }
}
