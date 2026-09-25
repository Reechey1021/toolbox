# tools/download-maps.ps1
# Downloads every map image (icons, radars, screenshots) into cs2-library/maps,
# so the library runs from your own copies. Safe to run again after a CS2 update.
#
# Run it from the cs2-library folder:
#   right-click this file, "Run with PowerShell"
# or in a terminal:
#   powershell -ExecutionPolicy Bypass -File tools\download-maps.ps1

$ErrorActionPreference = "Continue"
$base = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images"
$root = Join-Path $PSScriptRoot "..\maps"
$maps = @("de_mirage", "de_dust2", "de_inferno", "de_ancient", "de_cache", "de_train", "de_nuke", "de_overpass", "de_vertigo", "de_anubis")

foreach ($dir in @("", "radars", "thumbs")) { New-Item -ItemType Directory -Force -Path (Join-Path $root $dir) | Out-Null }

function Save($url, $file) {
  $out = Join-Path $root $file
  try {
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
    Write-Host "  saved   $file"
  } catch {
    Write-Host "  missing $file (not on GitHub)"
  }
}

foreach ($m in $maps) {
  Write-Host $m
  Save "$base/$m.png" "$m.png"
  Save "$base/radars/${m}_radar_psd.png" "radars\${m}_radar_psd.png"
  Save "$base/thumbs/${m}_1_png.png" "thumbs\${m}_1_png.png"
}
foreach ($m in @("de_nuke_lower", "de_vertigo_lower")) { Save "$base/radars/${m}_radar_psd.png" "radars\${m}_radar_psd.png" }

Write-Host ""
Write-Host "Done. The library now uses these files first."
