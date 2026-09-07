[CmdletBinding()]
param(
    [string]$MsiDirectory = "src-tauri/target/release/bundle/msi",
    [string]$NsisDirectory = "src-tauri/target/release/bundle/nsis",
    [string]$FrontendDist = "dist",
    [string]$Verifier = "scripts/verify-release-bundle.mjs",
    [string]$RunnerTemp = $env:RUNNER_TEMP
)

$ErrorActionPreference = "Stop"

function Get-ErrorMessage {
    param(
        [Parameter(Mandatory = $true)]
        [object]$ErrorRecord
    )

    if ($null -ne $ErrorRecord.Exception -and -not [string]::IsNullOrWhiteSpace($ErrorRecord.Exception.Message)) {
        return $ErrorRecord.Exception.Message
    }
    return [string]$ErrorRecord
}

function Write-CleanupWarning {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Context,

        [Parameter(Mandatory = $true)]
        [object[]]$Errors
    )

    $messages = @($Errors | ForEach-Object { Get-ErrorMessage -ErrorRecord $_ })
    Write-Warning "${Context}: $($messages -join '; ')"
}

function New-CleanupError {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Context,

        [Parameter(Mandatory = $true)]
        [object[]]$Errors
    )

    $messages = @($Errors | ForEach-Object { Get-ErrorMessage -ErrorRecord $_ })
    return [System.InvalidOperationException]::new("${Context}: $($messages -join '; ')")
}

function Invoke-ReleaseBundleVerifier {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BundleRoot,

        [Parameter(Mandatory = $true)]
        [string]$InstallerPath
    )

    Write-Host "Verifying Windows installer payload: $InstallerPath"
    & node $Verifier `
        "--platform=windows" `
        "--root=$BundleRoot" `
        "--frontend-dist=$FrontendDist" `
        "--smoke-sidecar"
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Release bundle verification failed for $InstallerPath (exit code $exitCode)."
    }
}

function Get-InstallerBundleRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExtractionRoot,

        [Parameter(Mandatory = $true)]
        [string]$InstallerPath
    )

    $executables = @(Get-ChildItem `
        -LiteralPath $ExtractionRoot `
        -Filter "Musical.exe" `
        -File `
        -Recurse `
        -ErrorAction Stop | Where-Object { $_.Name -ieq "Musical.exe" })

    if ($executables.Count -ne 1) {
        throw "Expected exactly one Musical.exe below $ExtractionRoot for $InstallerPath, found $($executables.Count)."
    }

    $bundleRoot = $executables[0].DirectoryName
    if ([string]::IsNullOrWhiteSpace($bundleRoot)) {
        throw "Musical.exe has no parent directory below $ExtractionRoot for $InstallerPath."
    }
    return $bundleRoot
}

function New-ExtractionRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TemporaryRoot,

        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    $safeLabel = $Label -replace "[^A-Za-z0-9.-]", "-"
    $path = Join-Path $TemporaryRoot ("{0}-{1}" -f $safeLabel, [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    return $path
}

function Invoke-MsiAdministrativeExtract {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$ExtractionRoot
    )

    $logPath = Join-Path $ExtractionRoot "msiexec.log"
    $arguments = @(
        "/a",
        ('"{0}"' -f $InstallerPath),
        "/qn",
        "/norestart",
        ('TARGETDIR="{0}"' -f $ExtractionRoot),
        "/L*v",
        ('"{0}"' -f $logPath)
    )
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "msiexec administrative extraction failed for $InstallerPath (exit code $($process.ExitCode)); log: $logPath"
    }
}

function Invoke-NsisSilentInstall {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$ExtractionRoot
    )

    # NSIS requires /D=x:\dirname to be the final switch, and the official
    # syntax does not quote the destination. RUNNER_TEMP is a space-free CI
    # path, so keep this argument in that exact form.
    $arguments = @(
        "/S",
        ("/D=$ExtractionRoot")
    )
    $process = Start-Process -FilePath $InstallerPath -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "NSIS silent installation failed for $InstallerPath (exit code $($process.ExitCode))."
    }
}

function Get-NsisUninstaller {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExtractionRoot,

        [Parameter(Mandatory = $true)]
        [string]$InstallerPath
    )

    $uninstallers = @(Get-ChildItem `
        -LiteralPath $ExtractionRoot `
        -Filter "*.exe" `
        -File `
        -Recurse `
        -ErrorAction Stop | Where-Object { $_.Name -match "(?i)uninstall" })

    if ($uninstallers.Count -ne 1) {
        throw "Expected exactly one NSIS uninstaller below $ExtractionRoot for $InstallerPath, found $($uninstallers.Count)."
    }

    return $uninstallers[0].FullName
}

function Invoke-NsisSilentUninstall {
    param(
        [Parameter(Mandatory = $true)]
        [string]$UninstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$InstallationRoot
    )

    # /S is the silent switch. _?= keeps the uninstaller in the installation
    # directory and is the final, unquoted argument so Start-Process waits for
    # the real cleanup instead of a temporary self-copy.
    $arguments = @(
        "/S",
        ("_?=$InstallationRoot")
    )
    $process = Start-Process -FilePath $UninstallerPath -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "NSIS silent uninstallation failed for $UninstallerPath (exit code $($process.ExitCode))."
    }
}

function Invoke-NsisInstallerVerification {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallerPath,

        [Parameter(Mandatory = $true)]
        [string]$ExtractionRoot
    )

    $verificationError = $null
    $cleanupErrors = @()
    $uninstallerPath = $null
    try {
        Invoke-NsisSilentInstall -InstallerPath $InstallerPath -ExtractionRoot $ExtractionRoot
        $uninstallerPath = Get-NsisUninstaller -ExtractionRoot $ExtractionRoot -InstallerPath $InstallerPath
        $bundleRoot = Get-InstallerBundleRoot -ExtractionRoot $ExtractionRoot -InstallerPath $InstallerPath
        Invoke-ReleaseBundleVerifier -BundleRoot $bundleRoot -InstallerPath $InstallerPath
    }
    catch {
        # Preserve the first failure so cleanup diagnostics cannot hide the
        # actual install or payload-verification error.
        $verificationError = $_
    }
    finally {
        if ($null -eq $uninstallerPath) {
            try {
                if (Test-Path -LiteralPath $ExtractionRoot -PathType Container) {
                    $uninstallerPath = Get-NsisUninstaller -ExtractionRoot $ExtractionRoot -InstallerPath $InstallerPath
                }
            }
            catch {
                $cleanupErrors += $_
            }
        }

        if ($null -ne $uninstallerPath) {
            try {
                Invoke-NsisSilentUninstall `
                    -UninstallerPath $uninstallerPath `
                    -InstallationRoot $ExtractionRoot
            }
            catch {
                $cleanupErrors += $_
            }
        }
    }

    if ($null -ne $verificationError) {
        if ($cleanupErrors.Count -gt 0) {
            Write-CleanupWarning `
                -Context "NSIS cleanup warning for $InstallerPath" `
                -Errors $cleanupErrors
        }
        throw $verificationError
    }
    if ($cleanupErrors.Count -gt 0) {
        throw (New-CleanupError `
            -Context "NSIS cleanup failed for $InstallerPath" `
            -Errors $cleanupErrors)
    }
}

$temporaryRoot = $null
$mainError = $null
$cleanupErrors = @()
try {
    if ([string]::IsNullOrWhiteSpace($RunnerTemp)) {
        throw "RUNNER_TEMP is required for Windows installer verification."
    }
    if (-not (Test-Path -LiteralPath $RunnerTemp -PathType Container)) {
        throw "RUNNER_TEMP does not exist or is not a directory: $RunnerTemp"
    }

    $msiInstallers = @(Get-ChildItem -LiteralPath $MsiDirectory -Filter "*.msi" -File -ErrorAction Stop | Sort-Object Name)
    if ($msiInstallers.Count -eq 0) {
        throw "No MSI installer found in $MsiDirectory."
    }

    $nsisInstallers = @(Get-ChildItem -LiteralPath $NsisDirectory -Filter "*.exe" -File -ErrorAction Stop | Sort-Object Name)
    if ($nsisInstallers.Count -eq 0) {
        throw "No NSIS installer found in $NsisDirectory."
    }

    $temporaryRoot = Join-Path ([IO.Path]::GetFullPath($RunnerTemp)) ("musical-release-verification-{0}" -f [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

    foreach ($installer in $msiInstallers) {
        $extractionRoot = New-ExtractionRoot -TemporaryRoot $temporaryRoot -Label "msi"
        Invoke-MsiAdministrativeExtract -InstallerPath $installer.FullName -ExtractionRoot $extractionRoot
        $bundleRoot = Get-InstallerBundleRoot -ExtractionRoot $extractionRoot -InstallerPath $installer.FullName
        Invoke-ReleaseBundleVerifier -BundleRoot $bundleRoot -InstallerPath $installer.FullName
    }

    foreach ($installer in $nsisInstallers) {
        $extractionRoot = New-ExtractionRoot -TemporaryRoot $temporaryRoot -Label "nsis"
        Invoke-NsisInstallerVerification -InstallerPath $installer.FullName -ExtractionRoot $extractionRoot
    }

    Write-Host "Windows MSI and NSIS installer verification passed."
}
catch {
    $mainError = $_
}
finally {
    if ($null -ne $temporaryRoot) {
        try {
            if (Test-Path -LiteralPath $temporaryRoot) {
                Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction Stop
            }
        }
        catch {
            $cleanupErrors += $_
        }
    }
}

if ($cleanupErrors.Count -gt 0) {
    if ($null -ne $mainError) {
        Write-CleanupWarning `
            -Context "Windows installer verification cleanup warning" `
            -Errors $cleanupErrors
    }
    else {
        throw (New-CleanupError `
            -Context "Windows installer verification cleanup failed" `
            -Errors $cleanupErrors)
    }
}
if ($null -ne $mainError) {
    throw $mainError
}
