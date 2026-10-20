// One-off SimpleFIN test: claims the setup token (once), then summarizes recent data.
// Never prints credentials. Usage: node scripts/simplefin-test.mjs [days=30]
import fs from 'node:fs';
import 'dotenv/config';

const ENV = new URL('../.env', import.meta.url);
const days = Number(process.argv[2] || 30);

function setEnv(key, value) {
  let s = fs.readFileSync(ENV, 'utf8').split('\n').filter(l => !l.startsWith(key + '=') && !l.startsWith('SIMPLEFIN_SETUP_TOKEN='));
  s.push(`${key}=${value}`);
  fs.writeFileSync(ENV, s.filter((l, i, a) => l || i < a.length - 1).join('\n') + '\n');
}

let accessUrl = process.env.SIMPLEFIN_ACCESS_URL;
if (!accessUrl) {
  const token = (process.env.SIMPLEFIN_SETUP_TOKEN || '').trim();
  if (!token) { console.log('No SIMPLEFIN_SETUP_TOKEN in .env yet.'); process.exit(1); }
  const claimUrl = Buffer.from(token, 'base64').toString('utf8').trim();
  const res = await fetch(claimUrl, { method: 'POST', headers: { 'Content-Length': '0' } });
  if (!res.ok) { console.log(`Claim failed: HTTP ${res.status} (token may already be used)`); process.exit(1); }
  accessUrl = (await res.text()).trim();
  setEnv('SIMPLEFIN_ACCESS_URL', accessUrl);
  console.log('Token claimed; access URL saved to .env (setup token removed).');
}

const u = new URL(accessUrl);
const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
const base = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
const start = Math.floor(Date.now() / 1000) - days * 86400;
const res = await fetch(`${base}/accounts?start-date=${start}&pending=1`, { headers: { Authorization: auth } });
if (!res.ok) { console.log(`Fetch failed: HTTP ${res.status}`); process.exit(1); }
const data = await res.json();

const d = ts => ts ? new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
if (data.errors?.length) console.log('Bridge messages:', data.errors.join(' | '));
for (const a of data.accounts) {
  const tx = a.transactions || [];
  const pending = tx.filter(t => t.pending);
  const newest = Math.max(0, ...tx.filter(t => !t.pending).map(t => t.posted));
  console.log(`\n${a.org?.name} | ${a.name} | balance ${a.balance} (as of ${d(a['balance-date'])})`);
  console.log(`  ${tx.length} txns in ${days}d, ${pending.length} pending, newest posted ${d(newest)}`);
  for (const t of tx.sort((x, y) => (y.transacted_at || y.posted) - (x.transacted_at || x.posted)).slice(0, 6))
    console.log(`   ${t.pending ? 'PEND' : 'post'} ${d(t.transacted_at || t.posted).padEnd(16)} ${String(t.amount).padStart(10)}  ${(t.payee || t.description || '').slice(0, 40)}`);
}
