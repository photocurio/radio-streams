#!/bin/bash
# Plays the newest Road Songs episode on a LinkPlay speaker (WiiM or Isetta).
# The archive stream URL comes from the newest episode .json saved by radio-download.js.
#
#   ./play-roadsongs.sh wiim
#   ./play-roadsongs.sh isetta
set -euo pipefail

WIIM_IP="192.168.4.41"
ISETTA_IP="192.168.4.43"
SHOW_DIR="${RADIO_DIR:-$HOME/Documents/Music/Radio}/Road Songs"

case "${1:-}" in
  wiim)   URL_BASE="https://$WIIM_IP" ;;
  isetta) URL_BASE="http://$ISETTA_IP" ;;
  *)      echo "Usage: $0 [wiim|isetta]"; exit 1 ;;
esac

# Files start with the date, so the last one alphabetically is the newest.
LATEST=$(ls -1 "$SHOW_DIR"/*.json 2>/dev/null | tail -1)
if [ -z "$LATEST" ]; then
  echo "No episodes in $SHOW_DIR. Run: node radio-download.js"
  exit 1
fi

STREAM_URL=$(jq -r .archiveUrl "$LATEST")
ENCODED_URL=$(jq -rn --arg u "$STREAM_URL" '$u | @uri')

echo "Playing $(basename "$LATEST" .json) on $1"
# -k: the WiiM uses a self-signed HTTPS certificate.
curl -sk "$URL_BASE/httpapi.asp?command=setPlayerCmd:play:$ENCODED_URL"
echo
