// roll.mjs — re-roll RPG rite sampai GTD (guaranteed/granted). Recruit dari pool 1500.
// Per akun utama: auth -> twitter link -> reveal -> (copper? recruit 5 -> reveal) ... -> GTD atau recruit pool habis
import fs from 'node:fs';
import { Wallet } from 'ethers';
import { ProxyAgent } from 'undici';

let proxyIdx = 0;
const proxyPool = (process.env.PROXY_POOL || 'YOUR_PROXY_POOL_URLS').split(',');
function nextProxy() { proxyIdx = (proxyIdx + Math.floor(Math.random() * 7) + 1) % proxyPool.length; return proxyPool[proxyIdx]; }

const BASE = 'https://www.rpg.cash/summoning-rite';
const OUT = process.env.RPG_OUT || '.';
const LOG = `${OUT}/roll.log`;
const STATE = process.env.STATE_FILE || `${OUT}/roll_state.json`;
const log = s => { const l = `[${new Date().toISOString()}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
const GTD = new Set(['guaranteed', 'granted']);

function makeApi() {
  const jar = {};
  async function api(path, opts = {}, body) {
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(x => setTimeout(x, 1000 + attempt * 2000));
      let r;
      try {
        r = await fetch(BASE + path, { ...opts, dispatcher: new ProxyAgent(nextProxy()), headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0', 'Origin': 'https://www.rpg.cash', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      } catch (e) { lastErr = e; continue; }
      if (r.status === 429) { lastErr = new Error('429'); await new Promise(x => setTimeout(x, 20000)); continue; }
      const scs = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of scs) { const kv = c.split(';')[0]; const eq = kv.indexOf('='); if (eq > 0) jar[kv.slice(0, eq)] = kv.slice(eq + 1); }
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    throw lastErr || new Error('api fail');
  }
  return api;
}

async function auth(api, w) {
  const n = (await api('/api/auth/nonce')).body.nonce;
  if (!n) return false;
  const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${w.addr}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  const sig = await new Wallet(w.pk).signMessage(msg);
  const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: '8B109977' });
  return a.status === 200;
}
async function signup(api, w, refCode) {
  const n = (await api('/api/auth/nonce')).body.nonce;
  if (!n) return false;
  const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${w.address}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  const sig = await new Wallet(w.privateKey).signMessage(msg);
  const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: refCode });
  return a.status === 200;
}

// ---- main ----
const pool152 = JSON.parse(fs.readFileSync(process.env.WALLET_POOL_FILE || 'YOUR_WALLET_POOL_FILE', 'utf8')).wallets;
const pool1500 = JSON.parse(fs.readFileSync(process.env.WALLET_BACKUP_POOL || 'YOUR_WALLET_BACKUP_POOL_FILE', 'utf8'));
const accounts = pool152.map((w, i) => ({ idx: i, addr: w.address, pk: w.privateKey }));
accounts.push({ idx: 152, addr: process.env.TREASURY_ADDRESS || 'YOUR_TREASURY_ADDRESS', pk: JSON.parse(fs.readFileSync(process.env.TREASURY_CREDS || 'YOUR_TREASURY_CREDS_FILE', 'utf8')).treasuryPk });
const names = fs.readFileSync(process.env.X_USERNAMES_FILE || 'YOUR_X_USERNAMES_FILE', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
let recruitCursor = 152;
let recruitPoolUsed = new Set();
const RS = parseInt(process.env.RECRUIT_START || '152');
const RE = parseInt(process.env.RECRUIT_END || String(pool1500.length));
recruitCursor = RS;

let state = {};
if (fs.existsSync(STATE)) state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
if (Array.isArray(state._used)) { for (const i of state._used) recruitPoolUsed.add(i); }
// cursor: max(RS, state cursor) — RECRUIT_START selalu menang sebagai batas bawah
recruitCursor = Math.max(RS, state._cursor || RS);
const save = () => { state._cursor = recruitCursor; state._used = [...recruitPoolUsed]; fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); };

const startI = parseInt(process.argv[2] || '0');
const endI = parseInt(process.argv[3] || String(accounts.length));
log(`== ROLL ${startI}-${endI} (${endI - startI} akun) — target GTD ==`);

for (let ai = startI; ai < endI; ai++) {
  const acct = accounts[ai];
  const key = String(acct.idx);
  let st = state[key] || { tier: null, status: null, rites: 0, recruits: 0, done: false };
  if (st.done) continue;
  state[key] = st;
  const api = makeApi();
  try {
    if (!(await auth(api, acct))) { log(`[${key}] auth fail`); continue; }
    // me -> referrals code + rite state
    const me = await api('/api/me');
    const u = me.body.user || {};
    const refCode = u.referralCode;
    st.refCode = refCode;
    log(`[${key}] ${acct.addr.slice(0, 10)} ref=${refCode} rite=${JSON.stringify(u.rite)}`);
    // twitter link once (handle unik)
    if (!st.linkedTwitter) {
      const h = names[ai] || `rpg${ai}`;
      const tw = await api('/api/twitter/link', { method: 'POST' }, { username: h.replace(/^@/, '').slice(0, 15) });
      st.linkedTwitter = tw.status === 200;
    }
    // reveal loop
    let guard = 0;
    while (guard++ < 40) {
      const r = await api('/api/faction', { method: 'POST' });
      if (r.status !== 200) {
        // rite exhausted -> recruit 5
        const msg = (r.body && r.body.error) || '';
        if (msg.includes('Recruit')) {
          const me2 = await api('/api/me');
          const rite = (me2.body.user || {}).rite || {};
          const need = rite.recruits + 5;
          log(`[${key}] ritus habis — recruit ${need}`);
          let recruited = 0;
          while (recruited < 5 && recruitCursor < RE) {
            if (recruitPoolUsed.has(recruitCursor)) { recruitCursor++; continue; }
            const rw = pool1500[recruitCursor];
            recruitCursor++;
            recruitPoolUsed.add(recruitCursor - 1);
            const rapi = makeApi();
            const ok2 = await signup(rapi, rw, refCode);
            if (ok2) { recruited++; st.recruits++; }
            await new Promise(x => setTimeout(x, 250));
          }
          save();
          if (recruited < 5) { log(`[${key}] recruit pool HABIS (${recruited})`); st.poolOut = true; break; }
          continue; // coba reveal lagi
        }
        if (r.status === 403) { log(`[${key}] 403 ${msg.slice(0, 80)}`); st.fail = msg.slice(0, 100); break; }
        log(`[${key}] reveal ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
        await new Promise(x => setTimeout(x, 1500));
        continue;
      }
      // 200 — reveal ok
      st.rites++;
      st.tier = r.body.tier;
      st.status = r.body.whitelist && r.body.whitelist.status;
      st.faction = r.body.faction;
      save();
      log(`[${key}] rite#${st.rites} => ${st.tier} (${st.status})`);
      if (GTD.has(st.status)) { st.done = true; save(); log(`[${key}] ✅ GTD ${st.status} di rite#${st.rites}`); break; }
      // copper — recruit 5 lalu loop lagi
      const me2 = await api('/api/me');
      const rite = (me2.body.user || {}).rite || {};
      const need = (rite.recruits || 0) + 5;
      let recruited = 0;
      while (recruited < 5 && recruitCursor < RE) {
        if (recruitPoolUsed.has(recruitCursor)) { recruitCursor++; continue; }
        const rw = pool1500[recruitCursor];
        recruitCursor++;
        recruitPoolUsed.add(recruitCursor - 1);
        const rapi = makeApi();
        const ok2 = await signup(rapi, rw, refCode);
        if (ok2) { recruited++; st.recruits++; }
        await new Promise(x => setTimeout(x, 250));
      }
      save();
      if (recruited < 5) { st.poolOut = true; save(); log(`[${key}] recruit pool HABIS — stop ${st.status}`); break; }
      log(`[${key}] +5 recruit (total ${st.recruits}) — lanjut rite`);
      await new Promise(x => setTimeout(x, 600));
    }
  } catch (e) {
    st.err = (e.message || e).slice(0, 120);
    log(`[${key}] ERR ${st.err}`);
  }
  await new Promise(x => setTimeout(x, 400));
}
log('== ROLL SELESAI ==');