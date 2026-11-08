#!/bin/bash
WIIM_IP="192.168.4.25"
STREAM_URL=$(cat lina-beach.txt)
ENCODED_URL=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$STREAM_URL")
curl -k "http://$WIIM_IP/httpapi.asp?command=setPlayerCmd:play:$ENCODED_URL"
