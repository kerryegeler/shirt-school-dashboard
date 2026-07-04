// Inspect production sales data to design the social-proof popup.
// Prints structure only — no emails, keys, or full payloads.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// 1. Distinct product names containing "challenge"
const { data: rev, error: e1 } = await supabase.from('revenue_entries')
  .select('product_name, description, source, received_at')
  .order('received_at', { ascending: false })
  .limit(2000)
if (e1) { console.error('revenue_entries error:', e1.message); process.exit(1) }

const counts = {}
for (const r of rev) {
  const p = r.product_name || r.description || '(none)'
  counts[p] = (counts[p] || 0) + 1
}
console.log('=== Product names in revenue_entries (last 2000 rows) ===')
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([p, n]) => console.log(`${String(n).padStart(4)}  ${p}`))

// 2. Challenge purchases: how recent, how many
const challenge = rev.filter((r) => /challenge/i.test(r.product_name || r.description || ''))
console.log(`\n=== Challenge-ish rows: ${challenge.length}, most recent: ${challenge[0]?.received_at}, product_name: "${challenge[0]?.product_name}" ===`)

// 3. kajabi_payments: does it have names? Check a few successful challenge rows.
const { data: kp, error: e2 } = await supabase.from('kajabi_payments')
  .select('customer_name, product_name, status, synced_at, raw_data')
  .eq('status', 'success')
  .ilike('product_name', '%challenge%')
  .order('synced_at', { ascending: false })
  .limit(5)
if (e2) console.error('kajabi_payments error:', e2.message)
console.log(`\n=== kajabi_payments successful challenge rows (sample of ${kp?.length || 0}) ===`)
for (const row of kp || []) {
  console.log(`- name present: ${!!row.customer_name} (first token: "${(row.customer_name || '').split(' ')[0]}"), product: "${row.product_name}", synced: ${row.synced_at}`)
}

// 4. Does the raw webhook payload contain ANY location-ish fields?
function findLocationKeys(obj, path = '', found = []) {
  if (!obj || typeof obj !== 'object') return found
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k
    if (/address|state|province|country|city|region|zip|postal|location/i.test(k)) {
      found.push(`${p} = ${typeof v === 'object' ? JSON.stringify(v)?.slice(0, 120) : String(v).slice(0, 60)}`)
    }
    if (typeof v === 'object') findLocationKeys(v, p, found)
  }
  return found
}
console.log('\n=== Location-ish keys in raw_data of those rows ===')
for (const row of kp || []) {
  const hits = findLocationKeys(row.raw_data)
  console.log(hits.length ? hits.join('\n') : '(none found)')
  console.log('  raw_data top-level keys:', Object.keys(row.raw_data || {}).join(', ') || '(empty)')
  console.log('---')
}
