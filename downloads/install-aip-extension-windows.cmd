@echo off
setlocal

title AIP Portfolio Capture setup helper

echo.
echo AIP Portfolio Capture setup helper
echo ----------------------------------
echo This downloads the official extension ZIP, verifies it, and prepares the folder for Chrome.
echo You will still need to click "Load unpacked" in Chrome and choose the copied folder path.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$zipUrl = 'https://aip-investment-dashboard-tracker.vercel.app/downloads/aip-portfolio-capture-extension.zip';" ^
  "$expectedHash = '48E296691AD56394AFA21C8A4AE0970DB238FB687119B2931B287FA4C4F27063';" ^
  "$installRoot = Join-Path $env:USERPROFILE 'Documents\AIP Portfolio Extension';" ^
  "$zipPath = Join-Path $env:TEMP 'aip-portfolio-capture-extension.zip';" ^
  "$extensionPath = Join-Path $installRoot 'extension';" ^
  "Write-Host 'Downloading extension package...';" ^
  "New-Item -ItemType Directory -Path $installRoot -Force | Out-Null;" ^
  "Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue;" ^
  "Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath;" ^
  "$actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant();" ^
  "if ($actualHash -ne $expectedHash) { throw 'The downloaded extension ZIP did not match the expected checksum. Please download it again from the dashboard.' }" ^
  "if (Test-Path -LiteralPath $extensionPath) { Remove-Item -LiteralPath $extensionPath -Recurse -Force; }" ^
  "Expand-Archive -LiteralPath $zipPath -DestinationPath $installRoot -Force;" ^
  "if (-not (Test-Path -LiteralPath (Join-Path $extensionPath 'manifest.json'))) { throw 'Could not find manifest.json after unzipping. Setup stopped.' }" ^
  "Set-Clipboard -Value $extensionPath;" ^
  "Write-Host '';" ^
  "Write-Host 'Extension folder ready:';" ^
  "Write-Host $extensionPath;" ^
  "Write-Host '';" ^
  "Write-Host 'The folder path has been copied to your clipboard.';" ^
  "Write-Host 'In Chrome: turn on Developer mode, click Load unpacked, then paste/select that folder.';" ^
  "try { Start-Process 'chrome.exe' 'chrome://extensions' } catch { Start-Process 'https://aip-investment-dashboard-tracker.vercel.app/#setup' }"

if errorlevel 1 (
  echo.
  echo Setup stopped before finishing.
  echo Please send Noah a screenshot of this window.
  echo.
  pause
  exit /b 1
)

echo.
echo Done. Chrome should be opening to chrome://extensions now.
echo Click "Load unpacked" and select the folder path that was copied to your clipboard.
echo.
pause
