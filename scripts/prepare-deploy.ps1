# Prepare the web app for standalone deployment.
# Creates a `deploy/` folder with everything needed to host independently.
#
# Usage: powershell -File scripts/prepare-deploy.ps1
# Then deploy the `deploy/` folder to your hosting provider.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$webDir = "$root\apps\web"
$deployDir = "$webDir\deploy"

Write-Host "Preparing deployment package..." -ForegroundColor Cyan

# Clean previous deploy
if (Test-Path $deployDir) { Remove-Item -Recurse -Force $deployDir }
New-Item -ItemType Directory -Path $deployDir | Out-Null

# Copy web app source
$webItems = @(
    "src", "public", "scripts",
    "server.ts", "next.config.ts", "tsconfig.json",
    "postcss.config.js", "tailwind.config.ts",
    "package.json", ".env.example"
)
foreach ($item in $webItems) {
    $source = "$webDir\$item"
    if (Test-Path $source) {
        if ((Get-Item $source).PSIsContainer) {
            Copy-Item -Recurse $source "$deployDir\$item"
        } else {
            Copy-Item $source "$deployDir\$item"
        }
    }
}

# Copy shared package (needed at build time)
$sharedDir = "$root\packages\shared"
New-Item -ItemType Directory -Path "$deployDir\packages\shared" | Out-Null
Copy-Item -Recurse "$sharedDir\src" "$deployDir\packages\shared\src"
Copy-Item "$sharedDir\package.json" "$deployDir\packages\shared\package.json"
if (Test-Path "$sharedDir\tsconfig.json") {
    Copy-Item "$sharedDir\tsconfig.json" "$deployDir\packages\shared\tsconfig.json"
}

# Create root package.json for workspace resolution
$rootPkg = @{
    name = "talkingo-deploy"
    private = $true
    workspaces = @(".", "packages/shared")
} | ConvertTo-Json -Depth 3
# Actually, for standalone we adjust the web package.json instead

# Update tsconfig paths to point to local packages/shared
$tsconfig = Get-Content "$deployDir\tsconfig.json" | ConvertFrom-Json
$tsconfig.compilerOptions.paths.'@talkingo/shared' = @("./packages/shared/src/index.ts")
$tsconfig.compilerOptions.paths.'@talkingo/shared/*' = @("./packages/shared/src/*")
$tsconfig | ConvertTo-Json -Depth 5 | Set-Content "$deployDir\tsconfig.json"

# Update next.config.ts turbopack root
$nextConfig = Get-Content "$deployDir\next.config.ts" -Raw
$nextConfig = $nextConfig -replace "path\.resolve\(__dirname, '\.\.', '\.\.'\)", "path.resolve(__dirname)"
Set-Content "$deployDir\next.config.ts" $nextConfig

# Create a root package.json that includes workspace
$deployPkg = @"
{
  "name": "talkingo-web",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/shared"],
  "scripts": {
    "dev": "tsx server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts"
  }
}
"@
# We keep the original package.json but add a note

Write-Host ""
Write-Host "Deploy package created at: $deployDir" -ForegroundColor Green
Write-Host ""
Write-Host "To deploy:" -ForegroundColor Yellow
Write-Host "  1. Copy .env.local into deploy/ (with production values)"
Write-Host "  2. cd deploy && npm install"
Write-Host "  3. npm run build"
Write-Host "  4. npm run start"
Write-Host ""
Write-Host "Or push to Vercel/Railway which handles monorepos natively."
