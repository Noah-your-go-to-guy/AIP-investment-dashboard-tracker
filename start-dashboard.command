#!/bin/bash
cd "$(dirname "$0")"

echo "Starting AIP Investment Dashboard..."
echo
echo "Keep this window open while you use the dashboard."
echo "If the browser opens before the server is ready, refresh the page."
echo

open "http://127.0.0.1:4173/"
node server.js

echo
echo "Dashboard stopped. You can close this window."
read -n 1 -s -r -p "Press any key to close..."
