param(
    [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'image-view-front-deploy'),
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectDirectory
try {
    if (-not $SkipBuild) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed. No deployment package created.' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist/index.html') -PathType Leaf)) {
        throw 'dist/index.html is missing. Run npm run build first.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'dist/assets') -PathType Container)) {
        throw 'dist/assets is missing. Run npm run build first.'
    }

    $destination = New-Item -ItemType Directory -Path $OutputDirectory -Force
    $archivePath = Join-Path $destination.FullName 'image-view-front.tar.gz'
    & tar.exe -czf $archivePath -C $projectDirectory dist
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the deployment archive.' }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nginx.conf.example') -Destination (Join-Path $destination.FullName 'image-view.conf') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DEPLOY.md') -Destination (Join-Path $destination.FullName 'DEPLOY.md') -Force

    Write-Host ''
    Write-Host "Deployment package: $($destination.FullName)"
    Get-ChildItem -LiteralPath $destination.FullName -File | Select-Object Name, Length
    Write-Host 'Upload image-view-front.tar.gz and image-view.conf. Follow DEPLOY.md on the Linux host.'
} finally {
    Pop-Location
}
