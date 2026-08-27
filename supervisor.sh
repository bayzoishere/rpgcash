#!/usr/bin/env bash
# supervisor rpg — spawn grinder batch terus sampai total GTD >= 20
cd "$(dirname "$0")" || exit 1
TARGET=20
BATCH_CHARS=(e f g h i j k l m n o p q r s t u v w x y z)
BATCH_IDX=0
SLEEP=240

count_gtd() {
  local c=0
  # dari grinder state files
  for f in grind_*.json; do
    [ -f "$f" ] || continue
    c=$((c + $(python3 -c "
import json,sys
try:
  s=json.load(open('$f'))
  print(sum(1 for k in s if s[k].get('done')))
except: print(0)
" 2>/dev/null)))
  done
  # dari roll.log (akun pool utama yg GTD)
  c=$((c + $(grep -c "✅ GTD" roll.log 2>/dev/null || echo 0)))
  echo "$c"
}

while true; do
  n=$(count_gtd)
  echo "[supervisor] $(date -u +%H:%M:%S) GTD count: $n / $TARGET"
  if [ "$n" -ge "$TARGET" ]; then
    echo "[supervisor] ✅ TARGET TERCAPAI — stop"
    exit 0
  fi
  # berapa grinder aktif?
  active=$(ps aux | grep -c "[g]rinder.mjs")
  if [ "$active" -lt 4 ] && [ "$BATCH_IDX" -lt "${#BATCH_CHARS[@]}" ]; then
    B="${BATCH_CHARS[$BATCH_IDX]}"
    BATCH_IDX=$((BATCH_IDX+1))
    echo "[supervisor] spawn grinder batch $B (30 akun)"
    nohup env BATCH="$B" timeout 3000 node grinder.mjs 30 >> "grind_$B.log" 2>&1 &
  fi
  sleep "$SLEEP"
done