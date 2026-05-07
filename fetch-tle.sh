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
LEO_URL="https://www.space-track.org/basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/PERIOD/87--120/orderby/MEAN_MOTION%20desc/limit/200/format/3le"
EXTRA_URL="https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/25544/format/3le"

curl -s -c "$COOKIES" -b "$COOKIES" "$LOGIN_URL" \
  -d "identity=${ST_USER}&password=${ST_PASS}" > /dev/null

curl -s -c "$COOKIES" -b "$COOKIES" "$LEO_URL" > "$OUT"
curl -s -c "$COOKIES" -b "$COOKIES" "$EXTRA_URL" >> "$OUT"

rm -f "$COOKIES"
