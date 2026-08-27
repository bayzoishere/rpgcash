#!/usr/bin/env bash
# spawner rpg — cron tiap 1 menit. Spawn sampai PER_TICK batch atau ACTIVE_CAP tercapai. Stop otomatis di target 20 gold.
# FIX 08-27: lock dilepas (exec 8>&-) SEBELUM spawn — anak gak mewarisi fd lock (sebelumnya deadlock: flock di-hold selama grinder hidup).
cd "$(dirname "$0")" || exit 0
TARGET=20
PER_TICK=6
ACTIVE_CAP=70   # pgrep count (timeout+node) — ≈35 batch, batas RAM VPS (5.9GB, grinder ~90MB/batch)
WORKDIR=$(dirname "$0")
COUNTER_FILE="$WORKDIR/.batch_counter"
LOCK_FILE="$WORKDIR/.counter.lock"

exec 8>"$LOCK_FILE"
flock -x 8

# GTD count — HANYA 🎉 (gold/guaranteed beneran)
gtd=$(grep -hE "🎉" "$WORKDIR"/grind_*.log 2>/dev/null | wc -l)
[ "$gtd" -ge "$TARGET" ] && exit 0

active=$(pgrep -fc "grinder.mjs" 2>/dev/null || echo 0)
if [ "$active" -ge "$ACTIVE_CAP" ]; then
  exit 0
fi

idx=0
[ -f "$COUNTER_FILE" ] && idx=$(cat "$COUNTER_FILE")

# hitung label batch di bawah lock
labels=""
spawned=0
while [ "$spawned" -lt "$PER_TICK" ] && [ "$active" -lt "$ACTIVE_CAP" ]; do
  n=$idx
  B=""
  while true; do
    r=$((n % 26))
    c=$(printf "\\$(printf '%03o' $((97 + r)))")
    B="${c}${B}"
    n=$((n / 26 - 1))
    [ "$n" -lt 0 ] && break
  done
  idx=$((idx + 1))
  labels="$labels $B"
  spawned=$((spawned + 1))
  active=$((active + 1))
done
echo $idx > "$COUNTER_FILE"
exec 8>&-   # 💥 LEPAS LOCK — anak-anak di bawah gak mewarisi fd lock

# spawn (lock udah bebas)
for B in $labels; do
  setsid nohup env BATCH="$B" timeout 5400 node "$WORKDIR/grinder.mjs" 30 >> "$WORKDIR/grind_$B.log" 2>&1 < /dev/null &
  echo "spawned $B (gtd=$gtd)" >> "$WORKDIR/spawner.log"
done
exit 0