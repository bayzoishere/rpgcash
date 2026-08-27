#!/usr/bin/env python3
# Re-bucket RPG.cash wallets by WEB TIER (copper=no spot, platinum=fcfs, gold=gtd)
import json, os, re, glob, shutil

os.chdir(os.environ.get('RPG_OUT', '.'))

# last reveal (rite, tier, status) per address prefix from logs
last = {}
for logf in glob.glob('grind_*.log') + ['roll.log']:
    for line in open(logf, errors='ignore'):
        m = re.search(r'(\dx[0-9a-fA-F]{6}) rite#(\d+) => (\w+) \((\w+)\)', line)
        if m:
            last[m.group(1)] = (m.group(2), m.group(3), m.group(4))

TIER_SPOT = {'gold': 'gtd', 'platinum': 'fcfs', 'copper': 'none'}

for t in TIER_SPOT:
    os.makedirs(t, exist_ok=True)

def bucket(fname, d):
    a8 = d.get('address', '')[:8]
    rite, tier, status = last.get(a8, ('?', '?', '?'))
    d['tier'] = tier
    d['tier_web'] = tier.capitalize()
    d['spot'] = TIER_SPOT.get(tier, '?')
    d['api_status'] = status
    d['last_reveal'] = f"rite#{rite} => {tier} ({status})"
    return tier

# 1. platinum_wallets/* -> re-bucket by tier
files = sorted(glob.glob('platinum_wallets/*.json'))
moved = {'gold': [], 'platinum': [], 'copper': []}
for f in files:
    d = json.load(open(f))
    tier = bucket(f, d)
    dst = f"{tier}/{os.path.basename(f)}"
    json.dump(d, open(dst, 'w'), indent=1)
    os.remove(f)  # write-through: file sudah di dst
    moved[tier].append((os.path.basename(f), d['address'], d['last_reveal']))

# 2. w0_pool.json -> copper (web shows Copper; user rule: copper = no spot)
f = 'fcfs_wallets/w0_pool.json'
d = json.load(open(f))
d['tier'] = 'copper'
d['tier_web'] = 'Copper'
d['spot'] = 'none'
d['api_status'] = 'granted'
d['last_reveal'] = 'rite#3 => copper (granted)'
d['tier_info'] = 'COPPER — no spot (web displays Copper; API status granted tapi tier copper)'
json.dump(d, open(f'copper/w0_pool.json', 'w'), indent=1)
os.remove(f)
moved['copper'].append(('w0_pool.json', d['address'], d['last_reveal']))

# 3. list.txt per new folder
for tier in ('gold', 'platinum', 'copper'):
    with open(f'{tier}/list.txt', 'w') as lf:
        lf.write(f"# {tier.upper()} = {TIER_SPOT[tier]} spot (web tier)\n")
        for name, addr, rev in moved[tier]:
            lf.write(f"{name} {addr} {rev}\n")
    # gold: gtd bucket kosong
    if tier == 'gold':
        lf = open('gold/list.txt', 'a')
        lf.write("# BELUM ADA HIT (0 gold dari ~4.8k reveal)\n")
        lf.close()

# 4. bersihin folder lama yg udah kosong
for old in ('platinum_wallets', 'fcfs_wallets'):
    if os.path.isdir(old) and not [x for x in os.listdir(old) if x != 'list.txt']:
        shutil.rmtree(old)
        print(f'removed {old}/')

# 5. catatan pool 152 — semua copper
with open('copper/list.txt', 'a') as lf:
    lf.write("# POOL 152 (roll): SEMUA final copper -> no spot, termasuk idx 0 (w0), 7, 8\n")

print('== RE-BUCKET SELESAI ==')
for tier in ('gold', 'platinum', 'copper'):
    print(f'{tier.upper()} ({TIER_SPOT[tier]}): {len(moved[tier])} akun')
    for name, addr, rev in moved[tier]:
        print(f'  {name} {addr} {rev}')