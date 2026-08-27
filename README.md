# RPG.cash Summoning Rite — farming scripts

Bots for rpg.cash Summoning Rite whitelist farming (SIWE auth, quest claims, rite reveals).

> **Security:** semua secrets di-load dari env vars. Repo ini TANPA credentials (PK, proxy, RPC — semua placeholder).

## Dependencies

```bash
npm init -y && npm install ethers undici
```

## Scripts

| Script | Fungsi |
|---|---|
| `batch.mjs` | Auth SIWE + claim 5 quests untuk akun pool (concurrent) |
| `roll.mjs` | Re-roll rite sampai GTD — recruit dari pool cadangan |
| `grinder.mjs` | Generate wallet baru → signup → quests → reveal loop (30 akun/batch) |
| `treasury_roll.mjs` | Roll akun treasury sampai GTD |
| `probe_auth.mjs` | Test format SIWE message |
| `rebucket.py` | Kategorikan hasil reveal by web tier (gold/platinum/copper) |
| `spawner.sh` / `supervisor*.sh` | Scheduler batch grinder (cron-friendly, stop otomatis di target) |

## Environment variables

| Env | Wajib | Keterangan |
|---|---|---|
| `RPG_OUT` | no (default `.`) | Output dir (logs/state) |
| `BATCH` | utk grinder/spawner | Label batch (nama file log/state) |
| `WALLET_POOL_FILE` | ya | JSON wallet pool `{wallets:[{address,privateKey}]}` |
| `WALLET_BACKUP_POOL` | ya (roll) | JSON backup pool 1500 |
| `ZYPER_POOL_FILE` | ya (treasury_roll) | File PK zyper (1 per line) |
| `TREASURY_CREDS` | ya | JSON `{treasuryPk}` |
| `TREASURY_ADDRESS` | ya | Alamat EVM treasury |
| `PROXIES_FILE` | ya (grinder) | File daftar proxy (1 per line, `[user:pass@]host:port`) |
| `PROXY_POOL` | ya (batch/roll) | URL proxy dipisah koma |
| `X_USERNAMES_FILE` | ya (roll) | File X usernames (1 per line) |
| `X_USERNAME` | no | X handle untuk treasury |

## Usage

```bash
# grinder 30 akun, label batch 'x'
BATCH=x RPG_OUT=./out PROXIES_FILE=/path/proxies.txt node grinder.mjs 30

# spawner (cron tiap 1 menit): spawn batch sampai cap, stop di 20 gold
bash spawner.sh
```