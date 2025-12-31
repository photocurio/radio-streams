#!/bin/bash

WIIM_IP="192.168.4.206"
ISETTA_IP="192.168.4.204"
STREAM_URL=$(cat latest-url.txt)
ENCODED_URL=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$STREAM_URL")

TARGET="$1"

if [ "$TARGET" = "wiim" ]; then
  IP="$WIIM_IP"
  PROTO="https"
  CURL_OPTS="-k"
elif [ "$TARGET" = "isetta" ]; then
  IP="$ISETTA_IP"
  PROTO="http"
  CURL_OPTS=""
else
  echo "Usage: $0 [wiim|isetta]"
  exit 1
fi

URL="$PROTO://$IP/httpapi.asp?command=setPlayerCmd:play:$ENCODED_URL"
curl $CURL_OPTS "$URL"
