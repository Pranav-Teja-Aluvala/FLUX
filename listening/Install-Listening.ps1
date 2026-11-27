param(
    [string]$ExtensionFolder = (Split-Path -Parent $PSScriptRoot),
    [switch]$PrepareModels
)

$ErrorActionPreference = 'Stop'
$extension = (Resolve-Path -LiteralPath $ExtensionFolder).Path.TrimEnd('\')
$manifest = Get-Content -LiteralPath (Join-Path $extension 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne 'FLUX' -or 'nativeMessaging' -notin $manifest.permissions) {
    throw 'Choose the unpacked FLUX extension folder containing its manifest.json.'
}

# Chromium derives an unpacked extension ID from its normalized path.
$identity = [char]::ToUpperInvariant($extension[0]) + $extension.Substring(1)
if ($manifest.key) {
    $identityBytes = [Convert]::FromBase64String($manifest.key)
} else {
    $identityBytes = [Text.Encoding]::Unicode.GetBytes($identity)
}
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $hex = [BitConverter]::ToString($sha.ComputeHash($identityBytes)).Replace('-', '').Substring(0, 32)
} finally {
    $sha.Dispose()
}
$extensionId = -join ($hex.ToCharArray() | ForEach-Object {
    [char]([int][char]'a' + [Convert]::ToInt32([string]$_, 16))
})

$install = Join-Path $env:USERPROFILE '.flux-listening'
New-Item -ItemType Directory -Path $install -Force | Out-Null
$python = Join-Path $install 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    & python -m venv --system-site-packages (Join-Path $install 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python could not create the listening environment.' }
}
& $python -m pip install --disable-pip-version-check 'torch==2.6.0' 'torchaudio==2.6.0' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw 'PyTorch installation failed. Use 64-bit Python 3.10 through 3.13.' }
& $python -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Listening dependencies could not be installed.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'host.py') -Destination $install -Force
$launcher = Join-Path $install 'flux-listening.exe'
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe "/out:$launcher" (Join-Path $PSScriptRoot 'Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Could not build the Chrome native messaging launcher.' }

if ($PrepareModels) {
    & $python (Join-Path $install 'host.py') --prepare
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the listening models.' }
}

$hostName = 'io.flux.listening'
$path = Join-Path $install "$hostName.json"
$allowed = @("chrome-extension://$extensionId/")
if (Test-Path -LiteralPath $path) {
    $previous = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $allowed += $previous.allowed_origins | Where-Object { $_ -match '^chrome-extension://[a-p]{32}/$' }
}
$config = @{
    name = $hostName
    description = 'FLUX local audio separation and transcription'
    path = $launcher
    type = 'stdio'
    allowed_origins = @($allowed | Select-Object -Unique)
}
[IO.File]::WriteAllText($path, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $key -Force | Out-Null
Set-Item -LiteralPath $key -Value $path
Write-Host "FLUX listening is registered for Chrome extension $extensionId."
