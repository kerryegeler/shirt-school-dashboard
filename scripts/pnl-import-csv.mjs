// Import a bank/card CSV download into bank_transactions (for history before the
// SimpleFIN feed starts). Only rows dated before that account's first SimpleFIN
// line are imported, so nothing is counted twice. Safe to re-run.
// Usage: node scripts/pnl-import-csv.mjs <file.csv> <account name contains…>
//   e.g. node scripts/pnl-import-csv.mjs ~/Business/_finance-imports/amex-gold-2006-2026ytd.csv "Business Gold"
import 'dotenv/config'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { applyRules } from '../pnl/rules.js'

const [file, accountMatch] = process.argv.slice(2)
if (!file || !accountMatch) { console.log('Usage: node scripts/pnl-import-csv.mjs <file.csv> "<account name contains>"'); process.exit(1) }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

const isoDate = (s) => {
  s = s.trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[0] : null
}
const num = (s) => Number(String(s || '').replace(/[$,\s]/g, '')) || 0

// Each bank's CSV → { date, description, cents } with cents negative = money out
function normalize(header, r) {
  const h = header.map((x) => x.trim().toLowerCase())
  const col = (name) => h.findIndex((x) => x === name)
  const get = (name) => r[col(name)] ?? ''
  if (col('debit') >= 0 && col('credit') >= 0) { // Capital One / U.S. Bank style
    const date = isoDate(get('transaction date') || get('posted date') || get('date'))
    return { date, description: get('description') || get('name'), cents: Math.round((num(get('credit')) - num(get('debit'))) * 100) }
  }
  if (col('transaction date') >= 0 && col('amount') >= 0) { // Chase: charges negative
    return { date: isoDate(get('transaction date')), description: get('description'), cents: Math.round(num(get('amount')) * 100) }
  }
  if (col('date') >= 0 && col('amount') >= 0) { // Amex: charges positive
    const amexStyle = /amex|american express/i.test(file) || h.includes('card member') || h.includes('receipt')
    const amt = num(get('amount'))
    const description = col('vendor') >= 0 ? `${get('vendor')} ${get('description')}`.trim() : (get('description') || get('name')) // MidFirst splits vendor/description
    return { date: isoDate(get('date')), description, cents: Math.round((amexStyle ? -amt : amt) * 100) }
  }
  throw new Error(`Unknown CSV layout: ${header.join(', ')}`)
}

const { data: accounts } = await sb.from('bank_accounts').select('*').eq('is_business', true).ilike('name', `%${accountMatch}%`)
if (accounts?.length !== 1) { console.log('Account match must be exactly one business account; got', accounts?.map((a) => a.name)); process.exit(1) }
const account = accounts[0]
const { data: first } = await sb.from('bank_transactions').select('posted_on').eq('account_id', account.id).eq('source', 'simplefin').order('posted_on').limit(1)
const cutoff = first?.[0]?.posted_on || '9999-12-31'

const [header, ...lines] = parseCsv(fs.readFileSync(file, 'utf8'))
const { data: rules } = await sb.from('category_rules').select('*').order('priority').order('created_at', { ascending: false })
const seen = {}
const rows = []
for (const r of lines) {
  const t = normalize(header, r)
  if (!t.date || !t.cents || t.date >= cutoff) continue
  const base = `${account.id}|${t.date}|${t.cents}|${t.description}`
  seen[base] = (seen[base] || 0) + 1
  const id = 'csv:' + crypto.createHash('sha1').update(`${base}|${seen[base]}`).digest('hex').slice(0, 20)
  const tx = { id, account_id: account.id, posted_on: t.date, amount_cents: t.cents, description: t.description.trim(), payee: null, pending: false, source: 'csv' }
  const hit = applyRules(tx, account, rules)
  rows.push({ ...tx, ...(hit || { kind: null, category: null, business: null, rule_id: null, status: 'review' }) })
}
// Keep anything already sorted by hand or suggested
const { data: existing } = await sb.from('bank_transactions').select('id,status').in('id', rows.map((r) => r.id).slice(0, 1000))
const keep = new Set((existing || []).filter((e) => e.status === 'confirmed' || e.status === 'suggested').map((e) => e.id))
const toWrite = rows.filter((r) => !keep.has(r.id))
for (let i = 0; i < toWrite.length; i += 500) {
  const { error } = await sb.from('bank_transactions').upsert(toWrite.slice(i, i + 500))
  if (error) throw new Error(error.message)
}
const out = rows.filter((r) => r.amount_cents < 0).reduce((s, r) => s + r.amount_cents, 0)
console.log(`${account.institution} ${account.name}: imported ${rows.length} lines before ${cutoff} (money out $${(-out / 100).toFixed(2)}), ${rows.filter((r) => r.status === 'review').length} need sorting`)
