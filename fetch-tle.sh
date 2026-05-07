#!/bin/bash
# Fetch TLE data from Space-Track.org
# Credentials are read from ~/.st-credentials (format: USER=... PASS=...)

CONFIG="${HOME}/.st-credentials"
if [[ ! -f "$CONFIG" ]]; then
  echo "Missing config file: $CONFIG" >&2
  exit 1
fi
source "$CONFIG"

ST_USER="${USER}"
ST_PASS="${PASS}"
OUT="${OUT:-data/visual.txt}"
COOKIES="/tmp/st-cookies.txt"
LOGIN_URL="https://www.space-track.org/ajaxauth/login"
TLE_URL="https://www.space-track.org/basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/PERIOD/0--128/orderby/NORAD_CAT_ID/limit/100/format/tle"

curl -s -c "$COOKIES" -b "$COOKIES" "$LOGIN_URL" \
  -d "identity=${ST_USER}&password=${ST_PASS}" > /dev/null

curl -s -c "$COOKIES" -b "$COOKIES" "$TLE_URL" -o "$OUT"

rm -f "$COOKIES"
