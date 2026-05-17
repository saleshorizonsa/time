# Time Attendance - Dev launcher
# Run this from the repo root: .\start-dev.ps1

$repoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverSrc  = "$repoRoot\server"
$clientSrc  = "$repoRoot\client"

$localServerModules = "C:\Users\$env:USERNAME\AppData\Local\time-server-modules"
$localClientModules = "C:\Users\$env:USERNAME\AppData\Local\time-client-modules"
$localServerRun     = "C:\Users\$env:USERNAME\AppData\Local\time-server-run"
$localClientBuild   = "C:\Users\$env:USERNAME\AppData\Local\time-client-build"

function Ensure-LocalModules {
    param($srcPackageJson, $localDir)
    $needsInstall = -not (Test-Path "$localDir\node_modules\express")
    if ($needsInstall) {
        Write-Host "Installing packages for $srcPackageJson ..."
        New-Item -ItemType Directory -Force -Path $localDir | Out-Null
        Copy-Item $srcPackageJson "$localDir\package.json"
        $lockFile = ($srcPackageJson -replace "package.json", "package-lock.json")
        if (Test-Path $lockFile) { Copy-Item $lockFile "$localDir\package-lock.json" }
        Push-Location $localDir
        npm install --omit=optional 2>&1 | Select-Object -Last 5
        Pop-Location
    }
}

# ── Server ──────────────────────────────────────────────────────────────────
Ensure-LocalModules "$serverSrc\package.json" $localServerModules

New-Item -ItemType Directory -Force -Path $localServerRun | Out-Null
robocopy $serverSrc $localServerRun /E /XD node_modules /NJH /NJS /NFL /NDL | Out-Null
Copy-Item "$repoRoot\.env" "$localServerRun\" -ErrorAction SilentlyContinue

$serverNodeModules = "$localServerRun\node_modules"
Remove-Item -Recurse -Force $serverNodeModules -ErrorAction SilentlyContinue
cmd /c "mklink /J `"$serverNodeModules`" `"$localServerModules\node_modules`"" | Out-Null

Write-Host "Starting API server on http://localhost:5000 ..."
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$localServerRun'; node src/index.js`""

# ── Client dev server ────────────────────────────────────────────────────────
Ensure-LocalModules "$clientSrc\package.json" $localClientModules

New-Item -ItemType Directory -Force -Path $localClientBuild | Out-Null
robocopy $clientSrc $localClientBuild /E /XD node_modules dist /NJH /NJS /NFL /NDL | Out-Null

$clientNodeModules = "$localClientBuild\node_modules"
Remove-Item -Recurse -Force $clientNodeModules -ErrorAction SilentlyContinue
cmd /c "mklink /J `"$clientNodeModules`" `"$localClientModules\node_modules`"" | Out-Null

Write-Host "Starting UI dev server on http://localhost:5173 ..."
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$localClientBuild'; node node_modules\vite\bin\vite.js --host 0.0.0.0`""

Write-Host ""
Write-Host "Both servers started. Open http://localhost:5173 in your browser."
