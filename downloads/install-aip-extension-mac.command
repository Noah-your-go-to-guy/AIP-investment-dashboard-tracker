#!/bin/bash
set -euo pipefail

ZIP_URL="https://aip-investment-dashboard-tracker.vercel.app/downloads/aip-portfolio-capture-extension.zip"
EXPECTED_HASH="48E296691AD56394AFA21C8A4AE0970DB238FB687119B2931B287FA4C4F27063"
INSTALL_ROOT="$HOME/Documents/AIP Portfolio Extension"
ZIP_PATH="${TMPDIR:-/tmp}/aip-portfolio-capture-extension.zip"
EXTENSION_PATH="$INSTALL_ROOT/extension"

echo
echo "AIP Portfolio Capture setup helper"
echo "----------------------------------"
echo "This downloads the official extension ZIP, verifies it, and prepares the folder for Chrome."
echo "You will still need to click Load unpacked in Chrome and choose the copied folder path."
echo

mkdir -p "$INSTALL_ROOT"
rm -f "$ZIP_PATH"

echo "Downloading extension package..."
curl -L "$ZIP_URL" -o "$ZIP_PATH"

ACTUAL_HASH="$(shasum -a 256 "$ZIP_PATH" | awk '{ print toupper($1) }')"
if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
  echo
  echo "The downloaded extension ZIP did not match the expected checksum."
  echo "Please download it again from the dashboard."
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

rm -rf "$EXTENSION_PATH"
unzip -q "$ZIP_PATH" -d "$INSTALL_ROOT"

if [ ! -f "$EXTENSION_PATH/manifest.json" ]; then
  echo
  echo "Could not find manifest.json after unzipping. Setup stopped."
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

printf "%s" "$EXTENSION_PATH" | pbcopy || true

echo
echo "Extension folder ready:"
echo "$EXTENSION_PATH"
echo
echo "The folder path has been copied to your clipboard."
echo "In Chrome: turn on Developer mode, click Load unpacked, then paste/select that folder."

open -a "Google Chrome" "chrome://extensions" 2>/dev/null || open "https://aip-investment-dashboard-tracker.vercel.app/#setup"

echo
read -r -p "Press Enter to close..."
