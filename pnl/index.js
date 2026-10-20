// Profit & Loss: bank/card sync (SimpleFIN), Stripe fees/refunds, P&L math,
// review queue and CPA export. Mounted by server.js.
// Plan: docs/pnl-plan.md
import { createClient } from '@supabase/supabase-js'
import * as R from './rules.js'

const TZ = 'America/Chicago'
const SYNC_EVERY_MS = 4 * 60 * 60 * 1000
const KAJABI_FEE = { pct: 0.029, fixed: 30 } // Kajabi Payments card fee, used as an estimate

// Service key bypasses RLS on the bank tables; anon works for revenue_entries in dev.
const sb = (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  : null

const OWNERS = (process.env.PNL_OWNER_EMAILS || 'kerry@shirtschool.com').split(',').map((s) => s.trim().toLowerCase())

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ymd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
const today = () => ymd(Date.now())
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const addMonths = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)

async function selectAll(table, build) {
  const rows = []
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build(sb.from(table)).range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

async function getState(key) {
  const { data } = await sb.from('pnl_state').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}
async function setState(key, value) {
  await sb.from('pnl_state').upsert({ key, value: String(value), updated_at: new Date().toISOString() })
}

// ─── SimpleFIN ───────────────────────────────────────────────────────────────

async function simplefin(startUnix, endUnix) {
  const u = new URL(process.env.SIMPLEFIN_ACCESS_URL)
  const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')
  const base = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`
  const res = await fetch(`${base}/accounts?start-date=${startUnix}&end-date=${endUnix}&pending=1`, { headers: { Authorization: auth } })
  if (!res.ok) throw new Error(`SimpleFIN HTTP ${res.status}`)
  return res.json()
}

// Business accounts Kerry named on 2026-10-20. New accounts default to personal
// (never stored) until flagged as business in bank_accounts.
const BUSINESS_ACCOUNT = /business checking|business credit card|spark|business platinum|business gold|^k\. egeler/i

let syncRunning = false

export async function syncBank({ days } = {}) {
  if (!sb || !process.env.SIMPLEFIN_ACCESS_URL) return { skipped: 'not configured' }
  if (syncRunning) return { skipped: 'already running' }
  syncRunning = true
  try {
    const now = Math.floor(Date.now() / 1000)
    const known = Object.fromEntries((await selectAll('bank_accounts', (q) => q.select('*'))).map((a) => [a.id, a]))
    let lookback = days
    if (!lookback) {
      const last = Object.values(known).filter((a) => a.is_business && a.last_synced_at).map((a) => new Date(a.last_synced_at).getTime())
      lookback = last.length ? Math.min(45, Math.ceil((Date.now() - Math.min(...last)) / 86400000) + 7) : 90
    }
    // SimpleFIN recommends <= 45 days per request
    const accounts = new Map()
    const messages = new Set()
    for (let end = now, since = now - lookback * 86400; end > since; end -= 45 * 86400) {
      const data = await simplefin(Math.max(since, end - 45 * 86400), end)
      for (const m of data.errors || []) if (!/recommended range/i.test(m)) messages.add(m)
      for (const a of data.accounts || []) {
        const cur = accounts.get(a.id) || { ...a, transactions: [] }
        cur.transactions.push(...(a.transactions || []))
        accounts.set(a.id, cur)
      }
    }

    const rules = await loadRules()
    let inserted = 0; let updated = 0
    for (const a of accounts.values()) {
      const isBusiness = known[a.id] ? known[a.id].is_business : BUSINESS_ACCOUNT.test(a.name || '')
      if (!isBusiness) {
        await sb.from('bank_accounts').upsert({ id: a.id, institution: a.org?.name, name: a.name, is_business: false })
        continue
      }
      const txs = dedupeById(a.transactions).map((t) => ({
        id: `${a.id}:${t.id}`,
        account_id: a.id,
        posted_on: ymd(((t.posted || t.transacted_at) || now) * 1000),
        amount_cents: Math.round(Number(t.amount) * 100),
        description: t.description || null,
        payee: t.payee || null,
        pending: !!t.pending,
      }))
      const newest = txs.filter((t) => !t.pending).map((t) => t.posted_on).sort().pop() || known[a.id]?.newest_posted_on || null
      await sb.from('bank_accounts').upsert({
        id: a.id, institution: a.org?.name, name: a.name, is_business: true,
        balance_cents: Math.round(Number(a.balance) * 100), balance_at: new Date((a['balance-date'] || now) * 1000).toISOString(),
        last_synced_at: new Date().toISOString(), newest_posted_on: newest,
      })
      const account = { ...a }
      const existing = new Map()
      for (let i = 0; i < txs.length; i += 200) {
        const { data } = await sb.from('bank_transactions').select('id,status,kind,category,business,rule_id').in('id', txs.slice(i, i + 200).map((t) => t.id))
        for (const r of data || []) existing.set(r.id, r)
      }
      const rows = txs.map((t) => {
        const prev = existing.get(t.id)
        if (prev && (prev.status === 'confirmed' || prev.status === 'suggested')) { // keep Kerry's/Eddie's sorting
          return { ...t, kind: prev.kind, category: prev.category, business: prev.business, rule_id: prev.rule_id, status: prev.status }
        }
        const hit = R.applyRules(t, account, rules)
        return { ...t, ...(hit || { kind: null, category: null, business: null, rule_id: null, status: 'review' }) }
      })
      for (const t of rows) existing.has(t.id) ? updated++ : inserted++
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('bank_transactions').upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() })))
        if (error) throw new Error(`upsert: ${error.message}`)
      }
      // Pending items that disappeared (posted under a new id, or dropped)
      const windowStart = ymd((now - lookback * 86400) * 1000)
      const live = new Set(txs.filter((t) => t.pending).map((t) => t.id))
      const { data: oldPending } = await sb.from('bank_transactions').select('id').eq('account_id', a.id).eq('pending', true).gte('posted_on', windowStart)
      const gone = (oldPending || []).map((r) => r.id).filter((id) => !live.has(id))
      if (gone.length) await sb.from('bank_transactions').delete().in('id', gone)
    }
    await setState('bank_last_sync', new Date().toISOString())
    if (messages.size) await setState('bank_messages', [...messages].join(' | '))
    return { inserted, updated, lookback, messages: [...messages] }
  } finally {
    syncRunning = false
  }
}

function dedupeById(list) {
  const m = new Map()
  for (const t of list) m.set(t.id, t)
  return [...m.values()]
}

async function loadRules() {
  const { data, error } = await sb.from('category_rules').select('*').order('priority').order('created_at', { ascending: false })
  if (error) throw new Error(`rules: ${error.message}`)
  return data
}

export async function seedRules() {
  if (!sb) return
  const { count, error } = await sb.from('category_rules').select('*', { count: 'exact', head: true })
  if (error || count > 0) return
  await sb.from('category_rules').insert(R.DEFAULT_RULES.map(([pattern, account_kind, direction, kind, category, business, priority]) =>
    ({ pattern, account_kind, direction, kind, category, business, priority, created_by: 'eddie' })))
  console.log(`[P&L] Seeded ${R.DEFAULT_RULES.length} sorting rules`)
}

// Re-sort every line that a rule (or nothing) decided, e.g. after a new rule.
export async function reapplyRules() {
  const rules = await loadRules()
  const accounts = Object.fromEntries((await selectAll('bank_accounts', (q) => q.select('*'))).map((a) => [a.id, a]))
  const rows = await selectAll('bank_transactions', (q) => q.select('id,account_id,posted_on,amount_cents,payee,description,kind,category,business,rule_id,status').in('status', ['rule', 'review', 'suggested']))
  // Only write lines whose sorting actually changes, in batches
  const changed = []
  for (const t of rows) {
    const hit = R.applyRules(t, accounts[t.account_id], rules)
    if (!hit) continue
    if (['kind', 'category', 'business', 'rule_id', 'status'].every((k) => (t[k] ?? null) === (hit[k] ?? null))) continue
    changed.push({ ...t, ...hit, updated_at: new Date().toISOString() })
  }
  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await sb.from('bank_transactions').upsert(changed.slice(i, i + 500))
    if (error) throw new Error(`reapply: ${error.message}`)
  }
  return changed.length
}

// ─── Stripe fees, refunds, disputes ──────────────────────────────────────────

export async function syncStripeAdjustments({ since } = {}) {
  if (!sb || !process.env.STRIPE_API_KEY) return { skipped: 'not configured' }
  const from = since || await getState('stripe_adj_since') || '2026-01-01'
  const gte = Math.floor(new Date(addDays(from, -3) + 'T00:00:00Z').getTime() / 1000)
  const headers = { Authorization: `Bearer ${process.env.STRIPE_API_KEY}` }
  const rows = []
  let after = null
  for (let page = 0; page < 200; page++) {
    const qs = new URLSearchParams({ limit: '100', 'created[gte]': String(gte), 'expand[]': 'data.source' })
    if (after) qs.set('starting_after', after)
    const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${qs}`, { headers })
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    for (const bt of data.data) {
      const on = ymd(bt.created * 1000)
      const src = typeof bt.source === 'object' && bt.source ? bt.source : {}
      let desc = src.description || ''
      if ((bt.type === 'refund' || bt.type === 'payment_refund') && typeof src.charge === 'string') {
        const c = await fetch(`https://api.stripe.com/v1/charges/${src.charge}`, { headers }).then((r) => r.json()).catch(() => ({}))
        desc = c.description || ''
      }
      const business = R.revenueBusiness({ source: 'stripe', description: desc })
      if (bt.fee > 0) rows.push({ id: `${bt.id}:fee`, processor: 'stripe', occurred_on: on, kind: 'fee', amount_cents: -bt.fee, business, description: desc || bt.type, charge_id: src.id || null })
      if (bt.type === 'refund' || bt.type === 'payment_refund') rows.push({ id: bt.id, processor: 'stripe', occurred_on: on, kind: 'refund', amount_cents: bt.amount, business, description: desc || 'Refund', charge_id: src.charge || null })
      if (bt.type === 'adjustment' && /dispute/i.test(bt.description || '')) rows.push({ id: bt.id, processor: 'stripe', occurred_on: on, kind: 'dispute', amount_cents: bt.amount, business, description: bt.description, charge_id: null })
      if (bt.type === 'stripe_fee') rows.push({ id: bt.id, processor: 'stripe', occurred_on: on, kind: 'fee', amount_cents: bt.amount, business: 'Shared', description: bt.description || 'Stripe fee', charge_id: null })
    }
    if (!data.has_more || !data.data.length) break
    after = data.data[data.data.length - 1].id
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('processor_adjustments').upsert(rows.slice(i, i + 500))
    if (error) throw new Error(`adjustments: ${error.message}`)
  }
  await setState('stripe_adj_since', addDays(today(), -7))
  return { rows: rows.length }
}

// ─── P&L math ────────────────────────────────────────────────────────────────
// Everything becomes "lines": { date, type: income|expense|draw, business, group, label, account, cents }
// income cents are + (refunds −); expense cents are + (credits −).

async function buildLines(from, to) {
  const [revenue, bank, adj, accounts] = await Promise.all([
    selectAll('revenue_entries', (q) => q.select('id,source,source_external_id,amount_cents,received_at,description,product_name,business,entered_manually')
      .gte('received_at', addDays(from, -120)).lte('received_at', to).order('received_at')),
    selectAll('bank_transactions', (q) => q.select('*').gte('posted_on', from).lte('posted_on', to).order('posted_on')),
    selectAll('processor_adjustments', (q) => q.select('*').gte('occurred_on', from).lte('occurred_on', to)),
    selectAll('bank_accounts', (q) => q.select('id,institution,name,is_business')),
  ])
  const acct = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const acctLabel = (id) => { const a = acct[id]; return a ? `${a.institution} ${a.name.replace(/\s*\(\d+\)$/, '')}`.replace('FREE BUSINESS CHECKING', 'Business Checking') : '' }
  const lines = []

  // Sales (Stripe, Kajabi, manual entries)
  const inRange = revenue.filter((r) => r.received_at >= from)
  const manualOther = inRange.filter((r) => !['stripe', 'kajabi'].includes(r.source)).map((r) => ({ ...r, used: false }))
  for (const r of inRange) {
    lines.push({ date: r.received_at, type: 'income', business: R.revenueBusiness(r), group: R.cleanProduct(r), label: R.cleanProduct(r), account: r.source, cents: r.amount_cents, ref: `rev:${r.id}` })
    if (r.source === 'kajabi') {
      const fee = Math.round(r.amount_cents * KAJABI_FEE.pct + KAJABI_FEE.fixed)
      lines.push({ date: r.received_at, type: 'expense', business: R.revenueBusiness(r), group: 'Payment processing', label: 'Kajabi fee (est.)', account: 'kajabi', cents: fee, ref: `kfee:${r.id}` })
    }
  }

  for (const t of bank) {
    if (!acct[t.account_id]?.is_business) continue
    const base = { date: t.posted_on, account: acctLabel(t.account_id), label: t.payee || t.description, ref: `bank:${t.id}`, pending: t.pending, status: t.status }
    if (t.kind === 'revenue') {
      // Skip deposits Kerry already entered by hand (same amount within $1, within 10 days)
      const m = manualOther.find((r) => !r.used && Math.abs(r.amount_cents - t.amount_cents) <= 100 && dayDiff(r.received_at, t.posted_on) <= 10)
      if (m) { m.used = true; continue }
      lines.push({ ...base, type: 'income', business: t.business || 'Shirt School', group: t.category || 'Other income', cents: t.amount_cents })
    } else if (t.kind === 'refund') {
      const amt = -t.amount_cents
      const sale = revenue.find((r) => r.source === 'kajabi' && Math.abs(r.amount_cents - amt) <= 1 && r.received_at <= t.posted_on && dayDiff(r.received_at, t.posted_on) <= 120)
      lines.push({ ...base, type: 'income', business: sale ? R.revenueBusiness(sale) : (t.business || 'Shirt School'), group: 'Refunds', label: `Refund · ${t.payee || t.description}`, cents: t.amount_cents })
    } else if (t.kind === 'expense' || (!t.kind && t.amount_cents < 0)) {
      lines.push({ ...base, type: 'expense', business: t.business || 'Shared', group: t.category || 'Uncategorized', cents: -t.amount_cents })
    } else if (t.kind === 'owner_draw') {
      lines.push({ ...base, type: 'draw', business: 'Shared', group: 'Owner draw', cents: -t.amount_cents })
    }
  }

  for (const a of adj) {
    if (a.kind === 'fee') lines.push({ date: a.occurred_on, type: 'expense', business: a.business || 'Shared', group: 'Payment processing', label: 'Stripe fee', account: 'stripe', cents: -a.amount_cents, ref: `adj:${a.id}` })
    else lines.push({ date: a.occurred_on, type: 'income', business: a.business || 'Shared', group: 'Refunds', label: `Stripe ${a.kind} · ${a.description || ''}`, account: 'stripe', cents: a.amount_cents, ref: `adj:${a.id}` })
  }
  return lines
}

const monthKey = (iso) => iso.slice(0, 7)

function totals(lines, from, to, business) {
  const t = { revenue: 0, expenses: 0, draws: 0 }
  for (const l of lines) {
    if (l.date < from || l.date > to) continue
    if (business && l.business !== business) continue
    if (l.type === 'income') t.revenue += l.cents
    else if (l.type === 'expense') t.expenses += l.cents
    else if (l.type === 'draw') t.draws += l.cents
  }
  t.profit = t.revenue - t.expenses
  return t
}

function groupSum(lines, keyFn) {
  const m = new Map()
  for (const l of lines) {
    const k = keyFn(l)
    const cur = m.get(k) || { key: k, cents: 0, count: 0 }
    cur.cents += l.cents; cur.count++
    m.set(k, cur)
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents)
}

export async function summary({ from, to, business }) {
  const year = to.slice(0, 4)
  const prevFrom = addMonths(from, -1); const prevTo = addMonths(to, -1)
  const lines = await buildLines([`${year}-01-01`, prevFrom].sort()[0], to)
  const inPeriod = lines.filter((l) => l.date >= from && l.date <= to && (!business || l.business === business))

  const monthly = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > monthKey(today()) && key > monthKey(to)) break
    const mFrom = `${key}-01`; const mTo = addDays(addMonths(mFrom, 1), -1)
    const t = totals(lines, mFrom, mTo, business)
    monthly.push({ month: key, revenue: t.revenue, expenses: t.expenses, profit: t.profit, partial: key === monthKey(today()) })
  }

  const accounts = await selectAll('bank_accounts', (q) => q.select('institution,name,last_synced_at,newest_posted_on,is_business').eq('is_business', true))
  const { count: reviewCount } = await sb.from('bank_transactions').select('*', { count: 'exact', head: true }).in('status', ['review', 'suggested'])

  return {
    period: { from, to, business: business || null },
    totals: totals(lines, from, to, business),
    previous: { from: prevFrom, to: prevTo, ...totals(lines, prevFrom, prevTo, business) },
    ytd: totals(lines, `${year}-01-01`, to, business),
    monthly,
    revenueByBusiness: R.BUSINESSES.map((b) => ({ business: b, cents: totals(lines, from, to, b).revenue })),
    revenueByProduct: groupSum(inPeriod.filter((l) => l.type === 'income'), (l) => `${l.business}|${l.group}`)
      .map((g) => ({ business: g.key.split('|')[0], product: g.key.split('|')[1], cents: g.cents, count: g.count })),
    expensesByCategory: groupSum(inPeriod.filter((l) => l.type === 'expense'), (l) => l.group).map((g) => ({ category: g.key, cents: g.cents, count: g.count })),
    expenseCount: inPeriod.filter((l) => l.type === 'expense' && l.ref.startsWith('bank:')).length,
    reviewCount: reviewCount || 0,
    freshness: {
      bankSyncedAt: await getState('bank_last_sync'),
      accounts: accounts.map((a) => ({ name: `${a.institution} · ${a.name.replace(/\s*\(\d+\)$/, '')}`, newest: a.newest_posted_on })),
      messages: await getState('bank_messages'),
    },
  }
}

const merchantPattern = (t) => (t.payee || t.description || '').toLowerCase().replace(/[#*].*$/, '').replace(/\s+\d[\d\s-]*$/, '').trim()

// ─── Routes ──────────────────────────────────────────────────────────────────

function requireOwner(req, res, next) {
  if (!sb) return res.status(503).json({ error: 'Database not configured' })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SIMPLEFIN_ACCESS_URL) return res.status(503).json({ error: 'Finishing setup: add SUPABASE_SERVICE_ROLE_KEY and SIMPLEFIN_ACCESS_URL in Railway → Variables.' })
  const email = (req.dashboardUser?.email || '').toLowerCase()
  if (!OWNERS.includes(email)) return res.status(403).json({ error: 'The P&L is only visible to Kerry.' })
  next()
}

function period(req) {
  const to = req.query.to || today()
  const from = req.query.from || `${to.slice(0, 7)}-01`
  return { from, to, business: R.BUSINESSES.includes(req.query.business) ? req.query.business : null }
}

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)) } catch (e) { console.error('[P&L]', e); res.status(500).json({ error: e.message }) }
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const dollars = (c) => (c / 100).toFixed(2)

export function registerPnl(app) {
  app.use('/api/pnl', requireOwner)

  app.get('/api/pnl/summary', wrap((req) => summary(period(req))))

  app.get('/api/pnl/options', wrap(async () => ({ businesses: R.BUSINESSES, categories: R.EXPENSE_CATEGORIES, kinds: R.KINDS })))

  // Every line in a period (income, expenses, draws) for the Revenue/Expenses tabs
  app.get('/api/pnl/lines', wrap(async (req) => {
    const p = period(req)
    const lines = (await buildLines(p.from, p.to)).filter((l) => l.date >= p.from && (!p.business || l.business === p.business))
    const type = req.query.type
    return { lines: lines.filter((l) => !type || l.type === type).sort((a, b) => b.date.localeCompare(a.date)) }
  }))

  // Bank/card lines with their sorting, for Expenses + Needs review
  app.get('/api/pnl/transactions', wrap(async (req) => {
    let q = sb.from('bank_transactions').select('*, bank_accounts(institution,name)').order('posted_on', { ascending: false }).limit(Math.min(+req.query.limit || 300, 2000))
    if (req.query.status) q = q.in('status', req.query.status.split(','))
    if (req.query.from) q = q.gte('posted_on', req.query.from)
    if (req.query.to) q = q.lte('posted_on', req.query.to)
    if (req.query.q) q = q.or(`payee.ilike.%${req.query.q.replace(/[%,()]/g, '')}%,description.ilike.%${req.query.q.replace(/[%,()]/g, '')}%`)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return { transactions: data }
  }))

  // Sort one line. makeRule: also sort every other line from the same merchant, now and later.
  app.patch('/api/pnl/transactions/:id', wrap(async (req) => {
    const { kind, category, business, note, makeRule } = req.body || {}
    if (kind && !R.KINDS.includes(kind)) throw new Error('Unknown kind')
    const { data: t, error } = await sb.from('bank_transactions').update({ kind, category: category ?? null, business: business ?? null, note: note ?? null, status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select('*, bank_accounts(name)').single()
    if (error) throw new Error(error.message)
    let resorted = 0
    if (makeRule && (t.payee || t.description)) {
      const pattern = merchantPattern(t)
      await sb.from('category_rules').insert({ pattern, account_kind: R.accountKind(t.bank_accounts), direction: t.amount_cents < 0 ? 'out' : 'in', kind, category, business, priority: 70, created_by: req.dashboardUser?.email || 'kerry' })
      resorted = await reapplyRules()
    }
    return { transaction: t, resorted }
  }))

  // Confirm Eddie's suggestions in bulk
  app.post('/api/pnl/review/accept', wrap(async (req) => {
    const ids = req.body?.ids
    let q = sb.from('bank_transactions').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('status', 'suggested')
    if (Array.isArray(ids) && ids.length) q = q.in('id', ids)
    const { data, error } = await q.select('payee,description,amount_cents,kind,category,business,bank_accounts(name)')
    if (error) throw new Error(error.message)
    // Remember each merchant so its future charges sort themselves
    const seen = new Set()
    const rules = []
    for (const t of data) {
      const pattern = merchantPattern(t)
      const key = `${pattern}|${R.accountKind(t.bank_accounts)}`
      if (!pattern || seen.has(key)) continue
      seen.add(key)
      rules.push({ pattern, account_kind: R.accountKind(t.bank_accounts), direction: null, kind: t.kind, category: t.category, business: t.business, priority: 70, created_by: req.dashboardUser?.email || 'kerry' })
    }
    if (rules.length) await sb.from('category_rules').insert(rules)
    return { confirmed: data.length, rules: rules.length }
  }))

  // Change a sale's business (e.g. a Stripe payment that's really Consulting)
  app.patch('/api/pnl/revenue/:id', wrap(async (req) => {
    const business = R.BUSINESSES.includes(req.body?.business) ? req.body.business : null
    const { error } = await sb.from('revenue_entries').update({ business }).eq('id', req.params.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  }))

  app.post('/api/pnl/sync', wrap(async () => ({ bank: await syncBank(), stripe: await syncStripeAdjustments() })))

  // CSV for the CPA. type=lines (every income/expense line) or type=summary (month × category)
  app.get('/api/pnl/export', async (req, res) => {
    try {
      const p = period(req)
      const lines = (await buildLines(p.from, p.to)).filter((l) => l.date >= p.from && (!p.business || l.business === p.business)).sort((a, b) => a.date.localeCompare(b.date))
      let csv
      if (req.query.type === 'summary') {
        const months = [...new Set(lines.map((l) => monthKey(l.date)))].sort()
        const rows = new Map()
        for (const l of lines) {
          const key = `${l.type === 'income' ? 'Income' : l.type === 'expense' ? 'Expense' : 'Owner draw'}|${l.group}`
          if (!rows.has(key)) rows.set(key, {})
          rows.get(key)[monthKey(l.date)] = (rows.get(key)[monthKey(l.date)] || 0) + l.cents
        }
        const order = [...rows.keys()].sort()
        csv = [['Type', 'Category', ...months, 'Total'].join(',')]
        for (const k of order) {
          const [type, group] = k.split('|'); const r = rows.get(k)
          csv.push([type, group, ...months.map((m) => dollars(r[m] || 0)), dollars(Object.values(r).reduce((a, b) => a + b, 0))].map(csvCell).join(','))
        }
        const net = months.map((m) => lines.filter((l) => monthKey(l.date) === m).reduce((s, l) => s + (l.type === 'income' ? l.cents : l.type === 'expense' ? -l.cents : 0), 0))
        csv.push(['Net profit', '', ...net.map(dollars), dollars(net.reduce((a, b) => a + b, 0))].map(csvCell).join(','))
      } else {
        csv = [['Date', 'Type', 'Category / product', 'Business', 'Description', 'Account', 'Amount'].join(',')]
        for (const l of lines) csv.push([l.date, l.type === 'income' ? 'Income' : l.type === 'expense' ? 'Expense' : 'Owner draw', l.group, l.business, l.label, l.account, dollars(l.type === 'income' ? l.cents : -l.cents)].map(csvCell).join(','))
      }
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="kevara-pnl-${req.query.type === 'summary' ? 'summary' : 'transactions'}-${p.from}-to-${p.to}.csv"`)
      res.send(csv.join('\n'))
    } catch (e) {
      console.error('[P&L export]', e); res.status(500).json({ error: e.message })
    }
  })
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export function startPnlScheduler() {
  if (!sb || !process.env.SIMPLEFIN_ACCESS_URL) {
    console.log('  P&L sync: not configured (needs SIMPLEFIN_ACCESS_URL + Supabase)')
    return
  }
  const run = async () => {
    try {
      const bank = await syncBank()
      const stripe = await syncStripeAdjustments()
      console.log('[P&L] sync', JSON.stringify({ bank, stripe }))
    } catch (e) { console.error('[P&L] sync failed:', e.message) }
  }
  seedRules().then(run)
  setInterval(run, SYNC_EVERY_MS)
  console.log('  P&L sync: every 4h')
}
