#!/usr/bin/env bash
# supervisor rpg v2 — spawn grinder batch BARU terus-menerus sampai GTD >= 20 (bukan nunggu aktif < 4)
cd "$(dirname "$0")" || exit 1
TARGET=20
SLEEP=90          # cek tiap 90 detik (dipercepat dari 240)
SPAWN_EVERY=1      # spawn 1 batch baru tiap tick selama < target
LETTERS=(s t u v w x y z aa ab ac ad ae af ag ah ai aj ak al am an ao ap aq ar as at au av aw ax ay az ba bb bc bd be bf bg bh bi bj bk bl bm bn bo bp bq br bs bt bu bv bw bx by bz)
IDX=0

count_gtd() {
  local c=$(grep -hE "🎉" "$WORKDIR"/grind_*.log 2>/dev/null | wc -l)
  c=$((c + $(grep -c "✅ GTD" "$WORKDIR"/roll.log 2>/dev/null || echo 0)))
  echo "$c"
}

while true; do
  n=$(count_gtd)
  echo "[sup2] $(date -u +%H:%M:%S) GTD=$n/$TARGET"
  [ "$n" -ge "$TARGET" ] && { echo "[sup2] TARGET 20 TERCAPAI"; exit 0; }
  if [ "$IDX" -lt "${#LETTERS[@]}" ]; then
    B="${LETTERS[$IDX]}"; IDX=$((IDX+1))
    echo "[sup2] spawn $B"
    nohup env BATCH="$B" timeout 5400 node grinder.mjs 30 >> "grind_$B.log" 2>&1 &
  fi
  sleep "$SLEEP"
done