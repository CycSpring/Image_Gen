$ErrorActionPreference = "Stop"

$zipUrl = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip"
$zipFile = Join-Path $PSScriptRoot "python-3.10.11-embed-amd64.zip"
$embedDir = Join-Path $PSScriptRoot "python-embed"
$sitePackagesDir = Join-Path $embedDir "Lib\site-packages"

# 1. Download Python Embeddable ZIP
if (-not (Test-Path $embedDir)) {
    Write-Host "Creating target directory: $embedDir"
    New-Item -ItemType Directory -Force -Path $embedDir | Out-Null
}

if (-not (Test-Path (Join-Path $embedDir "python.exe"))) {
    Write-Host "Downloading Python 3.10.11 Embeddable zip from $zipUrl..."
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile
    
    Write-Host "Extracting Python to $embedDir..."
    Expand-Archive -Path $zipFile -DestinationPath $embedDir -Force
    
    Write-Host "Cleaning up ZIP file..."
    Remove-Item -Path $zipFile -ErrorAction SilentlyContinue
} else {
    Write-Host "Python embeddable package already extracted in $embedDir."
}

# 2. Modify python310._pth
$pthFile = Join-Path $embedDir "python310._pth"
if (Test-Path $pthFile) {
    Write-Host "Configuring $pthFile..."
    $pthContent = @(
        "python310.zip",
        ".",
        "Lib\site-packages",
        "",
        "# Uncomment to run site.main() automatically",
        "import site"
    )
    [System.IO.File]::WriteAllLines($pthFile, $pthContent)
} else {
    Write-Warning "Could not find python310._pth file!"
}

# 3. Create Lib/site-packages
if (-not (Test-Path $sitePackagesDir)) {
    Write-Host "Creating site-packages directory: $sitePackagesDir"
    New-Item -ItemType Directory -Force -Path $sitePackagesDir | Out-Null
}

# 4. Install dependencies using host pip (forcing python 3.10 / win_amd64 architecture)
Write-Host "Installing packages (openai, pillow, exceptiongroup) into embedded site-packages..."
$pipArgs = @("install", "openai", "pillow", "exceptiongroup", "--target", $sitePackagesDir, "--upgrade", "--python-version", "3.10", "--platform", "win_amd64", "--implementation", "cp", "--only-binary=:all:")
$pipSuccess = $false
try {
    & pip $pipArgs
    $pipSuccess = $true
} catch {
    Write-Warning "Failed to run 'pip' directly. Trying 'python -m pip'..."
}

if (-not $pipSuccess) {
    try {
        $pythonArgs = @("-m", "pip") + $pipArgs
        & python $pythonArgs
        $pipSuccess = $true
    } catch {
        Write-Warning "Failed to run 'python -m pip'. Trying 'py -m pip'..."
    }
}

if (-not $pipSuccess) {
    try {
        $pyArgs = @("-m", "pip") + $pipArgs
        & py $pyArgs
        $pipSuccess = $true
    } catch {
        Write-Error "Could not find a working pip installation on host machine to download packages! Please make sure python and pip are installed on your path."
    }
}

# 5. Verify the embedded environment can run image_gen.py
Write-Host "Verifying embedded Python environment..."
$pythonExe = Join-Path $embedDir "python.exe"
$scriptPath = Join-Path $PSScriptRoot "scripts\image_gen.py"

if (Test-Path $pythonExe) {
    # Run a simple check (e.g. print version and test import of openai, pillow)
    & $pythonExe -c "import sys; print('Python version:', sys.version); import openai; import PIL; print('Dependencies (openai, pillow) loaded successfully!')"
    
    Write-Host "`nEmbedded Python Environment successfully configured!" -ForegroundColor Green
} else {
    Write-Error "Verification failed: python.exe not found in $embedDir."
}
