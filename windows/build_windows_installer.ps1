param(
  [string]$PythonExe = "python",
  [string]$InnoSetupCompiler = ""
)

function Resolve-InnoSetupCompiler {
  param(
    [string]$PreferredPath
  )

  if ($PreferredPath -and (Test-Path $PreferredPath)) {
    return (Resolve-Path $PreferredPath).Path
  }

  $candidates = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  )

  foreach ($path in $candidates) {
    if (Test-Path $path) {
      return $path
    }
  }

  $registryKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1"
  )

  foreach ($key in $registryKeys) {
    try {
      $installLocation = (Get-ItemProperty -Path $key -ErrorAction Stop).InstallLocation
      if ($installLocation) {
        $compilerPath = Join-Path $installLocation "ISCC.exe"
        if (Test-Path $compilerPath) {
          return $compilerPath
        }
      }
    }
    catch {
      # Ignore missing registry keys and continue probing.
    }
  }

  $appPathsKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ISCC.exe"
  try {
    $appPathValue = (Get-ItemProperty -Path $appPathsKey -ErrorAction Stop).'(default)'
    if ($appPathValue -and (Test-Path $appPathValue)) {
      return (Resolve-Path $appPathValue).Path
    }
  }
  catch {
    # Ignore missing app-path registration.
  }

  try {
    $isccFromPath = (Get-Command "ISCC.exe" -ErrorAction Stop).Source
    if ($isccFromPath -and (Test-Path $isccFromPath)) {
      return (Resolve-Path $isccFromPath).Path
    }
  }
  catch {
    # Ignore if ISCC is not on PATH.
  }

  return $null
}

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PayloadRoot = Join-Path $RepoRoot ".installer_payload"
$AppPayloadDir = Join-Path $PayloadRoot "app-unpacked"
$DesktopDir = Join-Path $RepoRoot "desktop"
$DesktopBuildResources = Join-Path $DesktopDir "build-resources"
$BackendDistDir = Join-Path $RepoRoot "dist"
$BackendWorkDir = Join-Path $RepoRoot "build"
$BackendSpecDir = Join-Path $RepoRoot "windows"
$BackendExe = Join-Path $BackendDistDir "AIInterviewBackend.exe"
$FrontendDistDir = Join-Path $RepoRoot "frontend/dist"

Write-Host "Installing backend packaging dependencies..."
& $PythonExe -m pip install --upgrade pyinstaller SpeechRecognition

Write-Host "Building frontend static bundle..."
Push-Location (Join-Path $RepoRoot "frontend")
npm install
npm run build
Pop-Location

if (!(Test-Path $FrontendDistDir)) {
  throw "Frontend dist folder not found at $FrontendDistDir"
}

Write-Host "Building backend executable..."
& $PythonExe -m PyInstaller --onefile --name AIInterviewBackend `
  --distpath $BackendDistDir `
  --workpath $BackendWorkDir `
  --specpath $BackendSpecDir `
  (Join-Path $RepoRoot "backend/backend.py")

if (!(Test-Path $BackendExe)) {
  throw "Backend executable not found at $BackendExe. PyInstaller output may have been written elsewhere."
}

Write-Host "Preparing desktop build resources..."
if (Test-Path $DesktopBuildResources) {
  Remove-Item $DesktopBuildResources -Recurse -Force
}
New-Item -Path $DesktopBuildResources -ItemType Directory -Force | Out-Null
Copy-Item $BackendExe (Join-Path $DesktopBuildResources "AIInterviewBackend.exe") -Force
Copy-Item $FrontendDistDir (Join-Path $DesktopBuildResources "frontend") -Recurse -Force

Write-Host "Building desktop app bundle (win-unpacked + exe)..."
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:WIN_CSC_LINK = ""
$env:WIN_CSC_KEY_PASSWORD = ""
$env:ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = "true"
Push-Location $DesktopDir
npm install
npx electron-builder --win nsis dir
Pop-Location

$candidates = @(
  (Join-Path $RepoRoot "desktop/dist/win-unpacked"),
  (Join-Path $RepoRoot "desktop/dist/win-x64-unpacked"),
  (Join-Path $RepoRoot "desktop/dist/win-ia32-unpacked")
)
$appDistDir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $appDistDir) {
  throw "Desktop unpacked output not found. Expected one of: $($candidates -join ', ')"
}

Write-Host "Preparing installer payload from $appDistDir ..."
if (Test-Path $PayloadRoot) {
  Remove-Item $PayloadRoot -Recurse -Force
}
New-Item -Path $AppPayloadDir -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $appDistDir "*") $AppPayloadDir -Recurse -Force

$ResolvedInnoSetupCompiler = Resolve-InnoSetupCompiler -PreferredPath $InnoSetupCompiler
if (-not $ResolvedInnoSetupCompiler) {
  throw "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 or pass -InnoSetupCompiler with a valid path."
}

Write-Host "Compiling installer with $ResolvedInnoSetupCompiler ..."
& "$ResolvedInnoSetupCompiler" (Join-Path $RepoRoot "windows_installer.iss")

Write-Host "Done. Installer is available in the repository Output folder."
