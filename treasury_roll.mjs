// treasury_roll.mjs — roll akun treasury (idx 152) sampai GTD, recruit dari wallet pool + sisa pool
import fs from 'node:fs';
import { Wallet } from 'ethers';

const BASE = 'https://www.rpg.cash/summoning-rite';
const OUT = process.env.RPG_OUT || '.';
const LOG = `${OUT}/roll.log`;
const log = s => { const l = `[${new Date().toISOString()}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
const GTD = new Set(['guaranteed', 'granted']);

// recruit wallets: zyper PK segar
const zypers = fs.readFileSync(process.env.ZYPER_POOL_FILE || 'YOUR_ZYPER_POOL_FILE', 'utf8').split('\n').map(s => s.trim()).filter(Boolean).map(pk => ({ privateKey: pk.startsWith('0x') ? pk : '0x' + pk }));
// tambah sisa pool 1500 yang belum kepake (cek cursor batch lain)
const pool1500 = JSON.parse(fs.readFileSync(process.env.WALLET_BACKUP_POOL || 'YOUR_WALLET_BACKUP_POOL_FILE', 'utf8'));
const used = new Set();
for (const f of ['roll_s1.json', 'roll_s2.json', 'roll_s3.json', 'roll_s4.json', 'roll_s5.json']) {
  try { const s = JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')); for (const u of (s._used || [])) used.add(u); } catch {}
}
const fresh = [];
for (let i = 152; i < pool1500.length; i++) { if (!used.has(i)) fresh.push(pool1500[i]); }
log(`recruit tersedia: zyper=${zypers.length} + pool1500 fresh=${fresh.length}`);

const recruitPool = [...zypers, ...fresh];
let recruitCursor = 0;

function makeApi() {
  const jar = {};
  async function api(path, opts = {}, body) {
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise(x => setTimeout(x, 1000 + attempt * 2000));
      let r;
      try {
        r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0', 'Origin': 'https://www.rpg.cash', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
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

async function signup(w, refCode) {
  const api = makeApi();
  const n = (await api('/api/auth/nonce')).body.nonce;
  if (!n) return false;
  const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${w.address || new Wallet(w.privateKey).address}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  const sig = await new Wallet(w.privateKey).signMessage(msg);
  const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: refCode });
  return a.status === 200;
}

const treasuryPk = JSON.parse(fs.readFileSync(process.env.TREASURY_CREDS || 'YOUR_TREASURY_CREDS_FILE', 'utf8')).treasuryPk;
const treasury = { address: process.env.TREASURY_ADDRESS || 'YOUR_TREASURY_ADDRESS', pk: treasuryPk };
const st = { wallet: treasury.address, at: new Date().toISOString() };
const api = makeApi();
try {
  const n = (await api('/api/auth/nonce')).body.nonce;
  const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${treasury.address}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  const sig = await new Wallet(treasuryPk).signMessage(msg);
  const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: '8B109977' });
  if (a.status !== 200) { log('treasury verify fail ' + a.status + ' ' + JSON.stringify(a.body).slice(0, 100)); process.exit(1); }
  const me = await api('/api/me');
  const u = me.body.user || {};
  st.refCode = u.referralCode;
  log(`treasury: ref=${u.referralCode} rite=${JSON.stringify(u.rite)}`);
  // twitter link
  const tw = await api('/api/twitter/link', { method: 'POST' }, { username: process.env.X_USERNAME || 'REDACTED_USERNAME' });
  log('twitter link:', tw.status);
  // reveal loop sampai GTD (max 5 rite)
  for (let rite = 1; rite <= 5; rite++) {
    const r = await api('/api/faction', { method: 'POST' });
    if (r.status !== 200) {
      const msg2 = (r.body && r.body.error) || '';
      if (msg2.includes('Recruit')) {
        // recruit 5
        let rec = 0;
        while (rec < 5 && recruitCursor < recruitPool.length) {
          const rw = recruitPool[recruitCursor++];
          try {
            const ok = await signup(rw, st.refCode);
            if (ok) { rec++; st.recruits = (st.recruits || 0) + 1; }
          } catch {}
          await new Promise(x => setTimeout(x, 300));
        }
        log(`treasury rite${rite}: recruit ${rec} (total ${st.recruits}) — lanjut`);
        if (rec < 5) { st.fail = 'pool habis'; log('treasury: POOL HABIS ' + JSON.stringify(st)); fs.writeFileSync(`${OUT}/treasury_roll.json`, JSON.stringify(st, null, 1)); process.exit(0); }
        continue;
      }
      if (r.status === 403) { st.fail = msg2.slice(0, 120); log('treasury 403: ' + st.fail); break; }
      await new Promise(x => setTimeout(x, 2000));
      continue;
    }
    st.rite = rite;
    st.tier = r.body.tier;
    st.status = r.body.whitelist && r.body.whitelist.status;
    log(`treasury rite#${rite} => ${r.body.tier} (${st.status})`);
    if (GTD.has(st.status)) { st.done = true; log(`treasury ✅ GTD ${st.status} di rite#${rite}`); break; }
    // recruit 5 utk rite berikutnya
    let rec = 0;
    while (rec < 5 && recruitCursor < recruitPool.length) {
      const rw = recruitPool[recruitCursor++];
      try {
        const ok = await signup(rw, st.refCode);
        if (ok) { rec++; st.recruits = (st.recruits || 0) + 1; }
      } catch {}
      await new Promise(x => setTimeout(x, 300));
    }
    log(`treasury rite${rite}: recruit ${rec} (total ${st.recruits})`);
    if (rec < 5) { st.fail = 'pool habis'; break; }
  }
} catch (e) {
  st.err = (e.message || e).slice(0, 120);
}
fs.writeFileSync(`${OUT}/treasury_roll.json`, JSON.stringify(st, null, 1));
log('treasury roll selesai: ' + JSON.stringify(st).slice(0, 200));