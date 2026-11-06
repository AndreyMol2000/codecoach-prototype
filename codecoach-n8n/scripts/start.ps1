param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectRoot '.local-runtime.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Run scripts/setup.ps1 first.' }
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $config.statePath | Out-Null
$env:N8N_USER_FOLDER = $config.statePath
$env:N8N_LISTEN_ADDRESS = '127.0.0.1'
$env:N8N_PORT = '5678'
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
$env:N8N_PERSONALIZATION_ENABLED = 'false'
$env:N8N_VERSION_NOTIFICATIONS_ENABLED = 'false'
$env:GENERIC_TIMEZONE = 'Europe/Moscow'
$env:TZ = 'Europe/Moscow'
$env:N8N_SECURE_COOKIE = 'false'
$env:EXECUTIONS_DATA_PRUNE = 'true'
$env:EXECUTIONS_DATA_MAX_AGE = '24'
$env:EXECUTIONS_DATA_PRUNE_MAX_COUNT = '100'
$env:DB_SQLITE_VACUUM_ON_STARTUP = 'false'
$nodeExe = (Get-Command node.exe).Source
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
function Test-LocalService([string]$Url) { try { $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2; return $true } catch { return $false } }
if (-not (Test-LocalService 'http://127.0.0.1:8081/health')) {
    Start-Process -FilePath $config.llamaBin -ArgumentList @('-m',('"'+$config.modelPath+'"'),'--host','127.0.0.1','--port','8081','--alias','codecoach-qwen','-c','2048','-t','4','-tb','4','-np','1','-ngl','0','-n','260','--reasoning','off','--no-webui','--metrics') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $config.statePath 'llama.out.log') -RedirectStandardError (Join-Path $config.statePath 'llama.err.log')
}
if (-not (Test-LocalService 'http://127.0.0.1:5678/healthz')) {
    Start-Process -FilePath $nodeExe -ArgumentList @(('"'+$config.n8nBin+'"'),'start') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $config.statePath 'n8n.out.log') -RedirectStandardError (Join-Path $config.statePath 'n8n.err.log')
}
if (-not (Test-LocalService 'http://127.0.0.1:3010/api/status')) {
    Start-Process -FilePath $nodeExe -ArgumentList @(('"'+(Join-Path $projectRoot 'web-server.mjs')+'"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $config.statePath 'web.out.log') -RedirectStandardError (Join-Path $config.statePath 'web.err.log')
}
Write-Output 'n8n editor: http://127.0.0.1:5678'
Write-Output 'CodeCoach web chat: http://127.0.0.1:3010'
Write-Output 'First launch: complete local n8n account setup, import codecoach-workflow.json and publish the workflow.'
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:3010' }
