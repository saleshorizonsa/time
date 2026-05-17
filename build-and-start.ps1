# Time Attendance - Production build + start
# Run: .\build-and-start.ps1

$repoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverSrc  = "$repoRoot\server"
$clientSrc  = "$repoRoot\client"

$localServerModules = "C:\Users\$env:USERNAME\AppData\Local\time-server-modules"
$localClientModules = "C:\Users\$env:USERNAME\AppData\Local\time-client-modules"
$localServerRun     = "C:\Users\$env:USERNAME\AppData\Local\time-server-run"
$localClientBuild   = "C:\Users\$env:USERNAME\AppData\Local\time-client-build"

function Ensure-LocalModules {
    param($srcPackageJson, $localDir, $omitOptional = $true)
    $testPkg = if ($srcPackageJson -match "server") { "express" } else { "vite" }
    $needsInstall = -not (Test-Path "$localDir\node_modules\$testPkg")
    if ($needsInstall) {
        Write-Host "  Installing packages..."
        New-Item -ItemType Directory -Force -Path $localDir | Out-Null
        Copy-Item $srcPackageJson "$localDir\package.json"
        $lockFile = ($srcPackageJson -replace "package.json", "package-lock.json")
        if (Test-Path $lockFile) { Copy-Item $lockFile "$localDir\package-lock.json" }
        Push-Location $localDir
        if ($omitOptional) { npm install --omit=optional 2>&1 | Select-Object -Last 3 }
        else { npm install 2>&1 | Select-Object -Last 3 }
        Pop-Location
    } else {
        Write-Host "  Packages already installed."
    }
}

function Link-NodeModules {
    param($linkPath, $targetPath)
    Remove-Item -Recurse -Force $linkPath -ErrorAction SilentlyContinue
    cmd /c "mklink /J `"$linkPath`" `"$targetPath`"" 2>&1 | Out-Null
}

# ── Build client ─────────────────────────────────────────────────────────────
Write-Host "`n[1/3] Building client..."
Ensure-LocalModules "$clientSrc\package.json" $localClientModules $false

New-Item -ItemType Directory -Force -Path $localClientBuild | Out-Null
robocopy $clientSrc $localClientBuild /E /XD node_modules dist /NJH /NJS /NFL /NDL | Out-Null
Link-NodeModules "$localClientBuild\node_modules" "$localClientModules\node_modules"

Push-Location $localClientBuild
node node_modules\vite\bin\vite.js build 2>&1
Pop-Location

# Copy dist back to repo
robocopy "$localClientBuild\dist" "$clientSrc\dist" /E /NJH /NJS /NFL /NDL | Out-Null
Write-Host "  Client built → client/dist/"

# ── Prepare server ────────────────────────────────────────────────────────────
Write-Host "`n[2/3] Preparing server..."
Ensure-LocalModules "$serverSrc\package.json" $localServerModules

New-Item -ItemType Directory -Force -Path $localServerRun | Out-Null
robocopy $serverSrc $localServerRun /E /XD node_modules /NJH /NJS /NFL /NDL | Out-Null
Copy-Item "$repoRoot\.env" "$localServerRun\" -ErrorAction SilentlyContinue
Link-NodeModules "$localServerRun\node_modules" "$localServerModules\node_modules"
Write-Host "  Server source synced."

# ── Run tests ─────────────────────────────────────────────────────────────────
Write-Host "`n[3/3] Running unit tests..."
Push-Location $localServerRun
node --test test/ 2>&1
Pop-Location

# ── Start server ──────────────────────────────────────────────────────────────
Write-Host "`nStarting API server on http://localhost:5000 ..."
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$localServerRun'; node src/index.js`""

Write-Host ""
Write-Host "Done. API: http://localhost:5000  |  Serve client/dist with any static server."
Write-Host "  Example: npx serve client/dist -p 3000"
