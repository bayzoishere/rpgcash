// rpg.cash summoning rite — 153 akun: auth SIWE (ref 8B109977) + claim 5 quests. Cookie jar per akun.
import fs from 'node:fs';
import { Wallet } from 'ethers';
import { ProxyAgent } from 'undici';

const REF = '8B109977';
const BASE = 'https://www.rpg.cash/summoning-rite';
const OUT = process.env.RPG_OUT || '.';
const LOG = `${OUT}/batch.log`;
fs.mkdirSync(OUT, { recursive: true });
const log = s => { const l = `[${new Date().toISOString()}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
const PROXIES = (process.env.PROXY_POOL || 'YOUR_PROXY_POOL_URLS').split(',');
let pIdx = 0;
function agent() { pIdx = (pIdx + 1) % PROXIES.length; return new ProxyAgent(PROXIES[pIdx]); }

function makeClient(ag) {
  const jar = {};
  async function api(path, opts = {}, body) {
    const r = await fetch(BASE + path, {
      ...opts, dispatcher: ag,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0', 'Origin': 'https://www.rpg.cash', 'Referer': BASE + '/?ref=' + REF, Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(opts.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const scs = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of scs) { const kv = c.split(';')[0]; const eq = kv.indexOf('='); if (eq > 0) jar[kv.slice(0, eq)] = kv.slice(eq + 1); }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  return api;
}

async function one(idx, wallet, pk) {
  const st = { i: idx, wallet, at: new Date().toISOString() };
  const ag = agent();
  const api = makeClient(ag);
  try {
    const n = (await api('/api/auth/nonce')).body.nonce;
    if (!n) { st.err = 'nonce gagal'; return st; }
    const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
    const sig = await new Wallet(pk).signMessage(msg);
    const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: REF });
    if (a.status !== 200) { st.err = 'verify ' + a.status + ' ' + JSON.stringify(a.body).slice(0, 120); return st; }
    st.userId = a.body.id;
    st.ref = a.body.referralCode;
    st.referredBy = a.body.referredBy;
    const claims = {};
    for (const q of ['follow', 'tweet', 'like', 'repost', 'refer']) {
      const r = await api(`/api/quests/${q}/claim`, { method: 'POST' });
      claims[q] = { s: r.status, reward: r.body?.reward };
    }
    st.claims = claims;
    st.ok = Object.values(claims).every(c => c.s === 200);
    const pts = Object.values(claims).reduce((a, c) => a + (c.reward || 0), 0);
    st.points = pts;
    log(`[${idx}] ${wallet.slice(0, 10)} ✅ points=${pts} claims=${Object.keys(claims).join(',')} referredBy=${st.referredBy}`);
  } catch (e) {
    st.err = (e.message || e).slice(0, 120);
    log(`[${idx}] ${wallet.slice(0, 10)} ❌ ${st.err}`);
  }
  fs.writeFileSync(`${OUT}/r_${idx}.json`, JSON.stringify(st));
  return st;
}

const pool = JSON.parse(fs.readFileSync(process.env.WALLET_POOL_FILE || 'YOUR_WALLET_POOL_FILE', 'utf8')).wallets;
const accounts = pool.map(w => ({ addr: w.address, pk: w.privateKey }));
accounts.push({ addr: process.env.TREASURY_ADDRESS || 'YOUR_TREASURY_ADDRESS', pk: JSON.parse(fs.readFileSync(process.env.TREASURY_CREDS || 'YOUR_TREASURY_CREDS_FILE', 'utf8')).treasuryPk });
const start = parseInt(process.argv[2] || '0');
const end = parseInt(process.argv[3] || String(accounts.length));
const conc = parseInt(process.argv[4] || '3');
log(`== rpg.cash summoning rite ${start}-${end} (${end - start}) conc=${conc} ref=${REF} ==`);
let cursor = start;
async function worker() {
  while (true) {
    const i = cursor++;
    if (i >= end) return;
    await one(i, accounts[i].addr, accounts[i].pk);
    await new Promise(r => setTimeout(r, 700 + Math.random() * 900));
  }
}
await Promise.all(Array.from({ length: conc }, () => worker()));
const files = fs.readdirSync(OUT).filter(f => f.startsWith('r_')).map(f => Number(f.slice(2, -5))).filter(n => n >= start && n < end);
let ok = 0, pts = 0;
for (const i of files) {
  try { const s = JSON.parse(fs.readFileSync(`${OUT}/r_${i}.json`, 'utf8')); if (s.ok) { ok++; pts += s.points || 0; } } catch {}
}
log(`== SELESAI: ok=${ok}/${files.length} totalPoints=${pts} ==`);