param([string]$RuntimeRoot = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeRoot) { $RuntimeRoot = Join-Path $projectRoot '.runtime' }
$RuntimeRoot = [IO.Path]::GetFullPath($RuntimeRoot)
$modelRoot = Join-Path $RuntimeRoot 'models'
$llamaRoot = Join-Path $RuntimeRoot 'llama'
New-Item -ItemType Directory -Force -Path $RuntimeRoot,$modelRoot,$llamaRoot | Out-Null
function Get-VerifiedFile([string]$Url,[string]$Target,[string]$Sha) {
    if ((Test-Path -LiteralPath $Target) -and (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLower() -eq $Sha) { return }
    $partial = $Target + '.part'
    & curl.exe --fail --location --retry 2 --connect-timeout 20 --output $partial $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLower() -ne $Sha) { throw "SHA256 check failed: $Target" }
    Move-Item -LiteralPath $partial -Destination $Target -Force
}
Get-VerifiedFile 'https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-win-cpu-x64.zip' (Join-Path $RuntimeRoot 'llama.zip') '37b3efcf962847ca869745fd4ccf7f5e7e8dacfeff9fa3523b4ca8cdc66d632b'
Expand-Archive -LiteralPath (Join-Path $RuntimeRoot 'llama.zip') -DestinationPath $llamaRoot -Force
Get-VerifiedFile 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf' (Join-Path $modelRoot 'qwen.gguf') '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a'
$env:npm_config_cache = Join-Path $RuntimeRoot 'npm-cache'
& npm.cmd install --prefix (Join-Path $RuntimeRoot 'n8n') n8n@2.44.7 --legacy-peer-deps --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'n8n installation failed. Prefer a short RuntimeRoot path under Documents/Codex.' }
$config = @{ n8nBin = (Join-Path $RuntimeRoot 'n8n\node_modules\n8n\bin\n8n'); llamaBin = (Join-Path $llamaRoot 'llama-server.exe'); modelPath = (Join-Path $modelRoot 'qwen.gguf'); statePath = (Join-Path $RuntimeRoot 'state') }
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot '.local-runtime.json') -Encoding utf8
Write-Output 'Setup complete. Run scripts/start.ps1'
