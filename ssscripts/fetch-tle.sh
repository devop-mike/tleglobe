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
HAM_IDS="7530,22825,24278,25544,27607,39444,40903,40906,40907,40908,40910,40911,40931,40967,42759,42761,43017,43137,43678,43770,43803,44909,45119,46494,46785"
WEATHER_IDS="25338,28654,33591,37849,38771,40069,43013,43689,44387"
LEO_URL="https://www.space-track.org/basicspacedata/query/class/gp/OBJECT_TYPE/PAYLOAD/PERIOD/87--120/EPOCH/%3Enow-30/orderby/MEAN_MOTION%20desc/limit/200/format/3le"
EXTRA_URL="https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${HAM_IDS},${WEATHER_IDS}/format/3le"

curl -s -c "$COOKIES" -b "$COOKIES" "$LOGIN_URL" \
  -d "identity=${ST_USER}&password=${ST_PASS}" > /dev/null

curl -s -c "$COOKIES" -b "$COOKIES" "$LEO_URL" > "$OUT"
curl -s -c "$COOKIES" -b "$COOKIES" "$EXTRA_URL" >> "$OUT"

rm -f "$COOKIES"
