# Yeni sürüm yayınlar: package.json sürümüyle GitHub release oluşturur, Setup + latest.yml yükler.
# Kullanım:  powershell -ExecutionPolicy Bypass -File scripts\release.ps1 "Bu sürümde neler var"
param([string]$Notes = "")
$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$ver = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$ver"
if (-not $Notes) { $Notes = "Orbit $ver" }

Remove-Item dist -Recurse -Force -ErrorAction SilentlyContinue
npx electron-builder --win --publish never
if ($LASTEXITCODE -ne 0) { throw "Derleme başarısız" }

# electron-builder'ın eşzamanlı yayınlama yarışını önlemek için yüklemeyi gh ile yapıyoruz
gh release create $tag --title $tag --notes $Notes "dist\Orbit-Setup-$ver.exe" "dist\Orbit-Setup-$ver.exe.blockmap" "dist\latest.yml"
if ($LASTEXITCODE -ne 0) { throw "Yayınlama başarısız" }
Write-Host "Yayınlandı: https://github.com/mlevncomm/orbit/releases/tag/$tag"
