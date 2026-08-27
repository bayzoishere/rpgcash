// grinder.mjs — GTD chase: generate wallet baru tiap akun utama (10 recruit/wallet dari wallet generate juga), ref 8B109977
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { Wallet } from 'ethers';
import { ProxyAgent } from 'undici';

const BASE = 'https://www.rpg.cash/summoning-rite';
const OUT = process.env.RPG_OUT || '.';
const LOG = `${OUT}/grind_${process.env.BATCH || 'a'}.log`;
const STATE = `${OUT}/grind_${process.env.BATCH || 'a'}.json`;
const GTD = new Set(['guaranteed']);
const REF = '8B109977';
const log = s => { const l = `[${new Date().toISOString()}] ${s}`; console.log(l); fs.appendFileSync(LOG, l + '\n'); };

// Direct DataImpulse (gak perlu fwdproxy lokal lagi — tes 08-27: ProxyAgent handle login koma OK)
let proxyIdx = 0;
const proxyPool = readFileSync(process.env.PROXIES_FILE || 'YOUR_PROXIES_FILE', 'utf8').trim().split('\n').filter(Boolean).map(l => 'http://' + l);
const nextProxy = () => proxyPool[(proxyIdx = (proxyIdx + Math.floor(Math.random() * 291) + 1) % proxyPool.length)];

function makeApi() {
  const jar = {};
  async function api(path, opts = {}, body) {
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise(x => setTimeout(x, 800 + attempt * 2000));
      let r;
      try {
        r = await fetch(BASE + path, { ...opts, dispatcher: new ProxyAgent(nextProxy()), headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0', 'Origin': 'https://www.rpg.cash', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
      } catch (e) { lastErr = e; continue; }
      if (r.status === 429) { lastErr = new Error('429'); await new Promise(x => setTimeout(x, 25000)); continue; }
      const scs = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      for (const c of scs) { const kv = c.split(';')[0]; const eq = kv.indexOf('='); if (eq > 0) jar[kv.slice(0, eq)] = kv.slice(eq + 1); }
      return { status: r.status, body: await r.json().catch(() => ({})) };
    }
    throw lastErr || new Error('api fail');
  }
  return api;
}

async function signup(api, w, refCode) {
  const n = (await api('/api/auth/nonce')).body.nonce;
  if (!n) return false;
  const msg = `www.rpg.cash wants you to sign in with your Ethereum account:\n${w.address}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  const sig = await new Wallet(w.privateKey).signMessage(msg);
  const a = await api('/api/auth/verify', { method: 'POST' }, { message: msg, signature: sig, referralCode: refCode });
  return a.status === 200;
}

const N = parseInt(process.argv[2] || '20');
let state = {};
if (fs.existsSync(STATE)) state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
log(`== GRINDER: ${N} akun baru (generate), ref=${REF} ==`);

let gtdCount = 0, failCount = 0;
for (let g = 0; g < N; g++) {
  const key = `g${g}`;
  if (state[key] && state[key].done) continue;
  const main = Wallet.createRandom();
  const st = { gen: g, main: main.address, at: new Date().toISOString() };
  state[key] = st;
  // save wallet penting (backup rule)
  try {
    const api = makeApi();
    if (!(await signup(api, { address: main.address, privateKey: main.privateKey }, REF))) { st.err = 'signup main fail'; }
    if (!st.err) {
      const me = await api('/api/me');
      const u = me.body.user || {};
      st.refCode = u.referralCode;
      await api('/api/twitter/link', { method: 'POST' }, { username: `grind${g}x${Math.floor(Math.random() * 9999)}`.slice(0, 15) }).catch(() => {});
      // WAJIB: claim semua quest dulu (8 pts) biar rite terbuka
      for (const q of ['follow', 'tweet', 'like', 'repost', 'refer']) {
        try { await api(`/api/quests/${q}/claim`, { method: 'POST' }); } catch {}
      }
      log(`${key} quests claimed`);
      // reveal loop
      for (let rite = 1; rite <= 5; rite++) {
        const r = await api('/api/faction', { method: 'POST' });
        if (r.status === 200) {
          st.rite = rite; st.tier = r.body.tier; st.status = r.body.whitelist && r.body.whitelist.status;
          log(`${key} ${main.address.slice(0, 8)} rite#${rite} => ${r.body.tier} (${st.status})`);
          if (st.status === 'guaranteed') { st.done = true; gtdCount++; log(`🎉 ${key} ✅ GTD ${st.status} rite#${rite} — disimpan`); break; }
          if (st.status === 'granted') { log(`⚡ ${key} FCFS ${st.status} rite#${rite} — catat`); st.fcfs = true; }
        } else {
          const msg2 = (r.body && r.body.error) || '';
          if (msg2.includes('Recruit')) {
            let rec = 0;
            while (rec < 5) {
              const rw = Wallet.createRandom();
              const rapi = makeApi();
              try {
                const ok = await signup(rapi, { address: rw.address, privateKey: rw.privateKey }, st.refCode);
                if (ok) { rec++; st.recruits = (st.recruits || 0) + 1; }
              } catch {}
              await new Promise(x => setTimeout(x, 250));
            }
            log(`${key} +5 recruit (total ${st.recruits})`);
            continue;
          }
          if (r.status === 403) { st.fail = msg2.slice(0, 100); failCount++; log(`${key} 403 ${st.fail}`); break; }
          await new Promise(x => setTimeout(x, 2000));
          continue;
        }
        // recruit 5 utk rite berikutnya
        let rec = 0;
        while (rec < 5) {
          const rw = Wallet.createRandom();
          const rapi = makeApi();
          try {
            const ok = await signup(rapi, { address: rw.address, privateKey: rw.privateKey }, st.refCode);
            if (ok) { rec++; st.recruits = (st.recruits || 0) + 1; }
          } catch {}
          await new Promise(x => setTimeout(x, 250));
        }
        log(`${key} +5 recruit`);
      }
    }
  } catch (e) {
    st.err = (e.message || e).slice(0, 100);
    log(`${key} ERR ${st.err}`);
  }
  // backup PK (write-through) — nama file per batch biar gak tabrakan
  fs.writeFileSync(`${OUT}/grind_wallets/${process.env.BATCH || 'a'}_${key}.json`, JSON.stringify({ address: main.address, privateKey: main.privateKey }, null, 1));
  // kategori simpanan by WEB TIER: gold=gtd, platinum=fcfs, copper=no spot (bukan whitelist.status!)
  const mkdir = p => { try { fs.mkdirSync(p, { recursive: true }); } catch {} };
  const TIER_SPOT = { gold: 'gtd', platinum: 'fcfs', copper: 'none' };
  const stamp = (dir, tag) => {
    mkdir(`${OUT}/${dir}`);
    fs.appendFileSync(`${OUT}/${dir}/list.txt`, `${new Date().toISOString()} ${process.env.BATCH || 'a'} ${key} ${main.address} tier=${st.tier} api=${st.status} rite#${st.rite || st.rites || '?'}\n`);
    fs.writeFileSync(`${OUT}/${dir}/${process.env.BATCH || 'a'}_${key}.json`, JSON.stringify({ address: main.address, privateKey: main.privateKey, tier: st.tier, tier_web: st.tier ? st.tier[0].toUpperCase() + st.tier.slice(1) : undefined, spot: TIER_SPOT[st.tier] || '?', api_status: st.status, rite: st.rite || st.rites }, null, 1));
    log(`${tag} SAVED ${key} ${main.address.slice(0, 8)} tier=${st.tier} (${st.status})`);
  };
  if (st.status === 'guaranteed' || st.tier === 'gold') stamp('gold', '🥇');
  else if (st.tier === 'platinum') stamp('platinum', '💎');
  // copper = no spot → gak disimpen (PK tetap di grind_wallets/ backup)
  fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  if (st.done) gtdCount++;
  await new Promise(x => setTimeout(x, 500));
}
log(`== GRINDER SELESAI: GTD=${gtdCount} fail=${failCount} ==`);