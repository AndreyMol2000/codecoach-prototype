$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot '.local-runtime.json') -Raw | ConvertFrom-Json
$env:N8N_USER_FOLDER = $config.statePath
$env:N8N_DIAGNOSTICS_ENABLED = 'false'
& node.exe $config.n8nBin 'import:workflow' ('--input='+(Join-Path $projectRoot 'codecoach-workflow.json'))
if ($LASTEXITCODE -ne 0) { throw 'Import failed. You can import the same JSON using the n8n editor.' }
Write-Output 'Workflow imported. Open n8n, inspect it and publish it to register its production webhook.'
