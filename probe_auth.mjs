// probe rpg.cash auth — coba format message SIWE, lihat error verify
import fs from 'node:fs';
import { Wallet } from 'ethers';
const pool = JSON.parse(fs.readFileSync(process.env.WALLET_POOL_FILE || 'YOUR_WALLET_POOL_FILE', 'utf8')).wallets;
const w = new Wallet(pool[0].privateKey);
const BASE = 'https://www.rpg.cash/summoning-rite';

let cookieJar = '';
async function nonce() {
  const r = await fetch(BASE + '/api/auth/nonce', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const sc = r.headers.get('set-cookie');
  if (sc) cookieJar = sc.split(';')[0];
  return (await r.json()).nonce;
}
async function verify(msg, sig) {
  const r = await fetch(BASE + '/api/auth/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://www.rpg.cash', 'Referer': 'https://www.rpg.cash/summoning-rite/?ref=8B109977', Cookie: cookieJar },
    body: JSON.stringify({ message: msg, signature: sig, referralCode: '8B109977' }),
  });
  const body = await r.text();
  const sc = r.headers.get('set-cookie');
  if (sc) cookieJar = sc.split(';')[0];
  return { status: r.status, body };
}

(async () => {
  const ts = new Date().toISOString();
  const cands = [
    (n) => `www.rpg.cash wants you to sign in with your Ethereum account:\n${w.address}\n\nSign in to RPG\n\nURI: https://www.rpg.cash\nVersion: 1\nChain ID: 8453\nNonce: ${n}\nIssued At: ${ts}`,
    (n) => `Sign in to RPG with your wallet.\nNonce: ${n}\nIssued At: ${ts}`,
    (n) => `RPG wants you to sign in with your Ethereum account:\n${w.address}\n\nNonce: ${n}\nIssued At: ${ts}`,
  ];
  for (const mk of cands) {
    const n = await nonce();
    const m = mk(n);
    const sig = await w.signMessage(m);
    const r = await verify(m, sig);
    console.log('---', m.slice(0, 70).replace(/\n/g, ' | '));
    console.log(r.status, r.body.slice(0, 250));
    await new Promise(x => setTimeout(x, 1500));
  }
})();