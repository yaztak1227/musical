$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$tauriRoot = Join-Path $root "src-tauri"
$appDir = Join-Path $env:LOCALAPPDATA "Programs\MusicalDev"
$logDir = Join-Path $appDir "logs"
$appExe = Join-Path $appDir "musical.exe"
$sourceExe = Join-Path $tauriRoot "target\debug\musical.exe"
$devCertificateSubject = "CN=Musical Local Dev Code Signing"

Set-Location $root

$vite = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList ".\node_modules\vite\bin\vite.js", "--host", "0.0.0.0", "--port", "1420" `
  -PassThru -WindowStyle Hidden

try {
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 500
    $ready = (Test-NetConnection localhost -Port 1420 -WarningAction SilentlyContinue).TcpTestSucceeded
  } while (-not $ready -and (Get-Date) -lt $deadline)

  if (-not $ready) {
    throw "Vite dev server did not start on localhost:1420."
  }

  $vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
  $cargoBuild = "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 && cd /d `"$tauriRoot`" && set `"CARGO_HTTP_CHECK_REVOKE=false`" && set `"PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\nodejs;%PATH%`" && cargo build"
  cmd.exe /d /s /c $cargoBuild
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE."
  }

  [System.IO.Directory]::CreateDirectory($appDir) | Out-Null
  [System.IO.Directory]::CreateDirectory($logDir) | Out-Null
  Copy-Item -LiteralPath $sourceExe -Destination $appExe -Force

  if ($env:MUSICAL_DEV_SIGN -eq "1") {
    $certificateThumbprint = $env:MUSICAL_WINDOWS_CERT_SHA1
    if (-not $certificateThumbprint) {
      $certificate = Get-ChildItem Cert:\CurrentUser\My |
        Where-Object { $_.Subject -eq $devCertificateSubject -and $_.HasPrivateKey } |
        Sort-Object NotAfter -Descending |
        Select-Object -First 1
      if ($certificate) {
        $certificateThumbprint = $certificate.Thumbprint
      }
    }

    if ($certificateThumbprint) {
      $signtool = $env:SIGNTOOL_PATH
      if (-not $signtool) {
        $signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
      }
      if (Test-Path -LiteralPath $signtool) {
        & $signtool sign /fd SHA256 /td SHA256 /tr "http://timestamp.digicert.com" /sha1 $certificateThumbprint $appExe
        if ($LASTEXITCODE -ne 0) {
          throw "signtool failed with exit code $LASTEXITCODE."
        }
      }
    }
  }

  $stdout = Join-Path $logDir "musical.out.log"
  $stderr = Join-Path $logDir "musical.err.log"
  Start-Process -FilePath $appExe -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Wait
}
finally {
  if ($vite -and -not $vite.HasExited) {
    Stop-Process -Id $vite.Id -Force
  }
}
