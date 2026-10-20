import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import SalesAnalytics from '../sales-analytics/SalesAnalytics.jsx'
import './pnl.css'

// Profit & Loss page. Server side: pnl/index.js. Plan: docs/pnl-plan.md

const BUSINESSES = ['Shirt School', 'Elite', 'Drop Studio', 'Brand Brain', 'Consulting']
const KIND_LABELS = { expense: 'Expense', revenue: 'Income', refund: 'Refund', payout: 'Payout (already counted)', transfer: 'Transfer', owner_draw: 'Owner draw', personal: 'Personal (not business)', ignore: 'Ignore' }
const SOURCE_NAMES = { stripe: 'Stripe', kajabi: 'Kajabi', impact: 'Impact', adsense: 'AdSense', paypal: 'PayPal', partnerstack: 'PartnerStack', affiliate_other: 'Affiliate', bank_deposit: 'Bank deposit', other: 'Other' }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Helpers ─────────────────────────────────────────────────────────────────

const chicagoToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const money = (c, cents = false) => {
  if (c == null) return '—'
  const v = Math.abs(c) / 100
  const s = v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  return (c < 0 ? '−$' : '$') + s
}
const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const monthName = (iso) => MONTHS[+iso.slice(5, 7) - 1]
const ago = (iso) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function presetRange(preset, custom) {
  const t = chicagoToday()
  const [y, m] = t.split('-').map(Number)
  const pad = (n) => String(n).padStart(2, '0')
  if (preset === 'last') {
    const ly = m === 1 ? y - 1 : y; const lm = m === 1 ? 12 : m - 1
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(new Date(ly, lm, 0).getDate())}` }
  }
  if (preset === 'ytd') return { from: `${y}-01-01`, to: t }
  if (preset === 'lastyear') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  if (preset === 'custom' && custom.from && custom.to) return custom
  return { from: `${y}-${pad(m)}-01`, to: t }
}

// Requests in flight → the top loading bar
let inflight = 0
const inflightListeners = new Set()
const setInflight = (d) => { inflight += d; inflightListeners.forEach((fn) => fn(inflight)) }
function useInflight() {
  const [n, setN] = useState(inflight)
  useEffect(() => { inflightListeners.add(setN); return () => inflightListeners.delete(setN) }, [])
  return n > 0
}

async function api(url, opts = {}) {
  setInflight(1)
  try { return await apiRequest(url, opts) } finally { setInflight(-1) }
}

async function apiRequest(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000), headers: opts.body ? { 'Content-Type': 'application/json' } : undefined, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function useCountUp(target, deps) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (target == null) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(target); return }
    let raf; const start = performance.now(); const from = 0; const dur = 1100
    const step = (t) => {
      const p = Math.min((t - start) / dur, 1); const e = 1 - Math.pow(1 - p, 4)
      setV(Math.round(from + (target - from) * e))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

const pct = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null)

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Kpi({ title, cents, meta, right, className = '', delay, extra, animKey }) {
  const v = useCountUp(cents, [cents, animKey])
  return (
    <div className={`pnl-card pnl-kpi s4 ${className}`} style={{ animationDelay: `${delay}s` }}>
      <h3>{title}{extra}</h3>
      <div className="val num">{money(v)}</div>
      <div className="meta"><span>{meta}</span>{right}</div>
    </div>
  )
}

function Delta({ now, prev, label, goodWhenUp = true }) {
  const d = pct(now, prev)
  if (d == null) return <span />
  const up = d >= 0
  return <span className={up === goodWhenUp ? 'pnl-up' : 'pnl-down'}>{up ? '▲' : '▼'} {Math.abs(d)}% vs {label}</span>
}

function BarList({ rows, color, onPick, empty = 'Nothing yet' }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 350); return () => clearTimeout(t) }, [rows])
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.cents)))
  if (!rows.length) return <div className="pnl-empty">{empty}</div>
  return (
    <div className="pnl-list">
      {rows.map((r) => (
        <div key={r.label} className={`pnl-li${onPick ? ' click' : ''}`} onClick={onPick ? () => onPick(r) : undefined}>
          <div className="top"><span>{r.label}</span><span className="num">{money(r.cents)}</span></div>
          <div className="pnl-track"><div className="pnl-fill" style={{ width: ready ? `${(Math.max(0, r.cents) / max) * 100}%` : 0, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}

function niceMax(v) {
  if (v <= 0) return 1000_00
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / exp
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * exp
}

function TrendChart({ monthly }) {
  const ref = useRef(null)
  const [w, setW] = useState(800)
  const [tip, setTip] = useState(null)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = w < 500 ? 240 : 300; const padL = 46; const padB = 26; const padT = 8
  const max = niceMax(Math.max(...monthly.map((m) => Math.max(m.revenue, m.expenses)), 1))
  const min = Math.min(0, ...monthly.map((m) => m.profit))
  const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min))
  const n = Math.max(monthly.length, 1)
  const band = (w - padL) / n
  const bw = Math.max(4, Math.min(16, band * 0.26)); const gap = 2
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
  const bar = (x, v) => {
    const top = y(Math.max(v, 0)); const base = y(0); const r = Math.min(4, base - top)
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`
  }
  const pts = monthly.map((m, i) => [padL + band * i + band / 2, y(m.profit)])
  const kfmt = (c) => { const d = c / 100; return d >= 1000 ? `$${Math.round(d / 1000)}k` : `$${d}` }
  return (
    <div ref={ref}>
      <svg className="pnl-trend" style={{ height: H }} role="img" aria-label="Revenue, expenses and profit by month">
        <g className="axis">
          {ticks.map((v) => (
            <g key={v}><line x1={padL} x2={w} y1={y(v)} y2={y(v)} stroke="var(--p-grid)" /><text x={padL - 10} y={y(v) + 4} textAnchor="end">{kfmt(v)}</text></g>
          ))}
          {monthly.map((m, i) => <text key={m.month} x={padL + band * i + band / 2} y={H - 6} textAnchor="middle">{monthName(m.month)}</text>)}
        </g>
        {monthly.map((m, i) => {
          const cx = padL + band * i + band / 2
          return (
            <g key={m.month} opacity={m.partial ? 0.85 : 1}>
              <path className="pnl-bar" fill="var(--p-rev)" d={bar(cx - bw - gap / 2, m.revenue)} style={{ animationDelay: `${0.3 + i * 0.04}s` }} />
              <path className="pnl-bar" fill="var(--p-exp)" d={bar(cx + gap / 2, m.expenses)} style={{ animationDelay: `${0.34 + i * 0.04}s` }} />
            </g>
          )
        })}
        {pts.length > 1 && <path className="pnl-pline" fill="none" stroke="var(--p-profit)" strokeWidth="2" strokeLinejoin="round" d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} />}
        {pts.map((p, i) => <circle key={i} className="pnl-pdot" cx={p[0]} cy={p[1]} r="4" fill="var(--p-profit)" stroke="#0d1015" strokeWidth="2" />)}
        {monthly.map((m, i) => (
          <rect key={m.month} className="pnl-hit" x={padL + band * i} y={padT} width={band} height={H - padT - padB} rx="8"
            onMouseMove={(e) => setTip({ m, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTip(null)}
            onClick={(e) => setTip({ m, x: e.clientX, y: e.clientY })} />
        ))}
      </svg>
      {/* Rendered at the page root: the cards' blur effect would otherwise trap it behind the next card */}
      {tip && createPortal(
        <div className="pnl-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 200), top: tip.y - 20 }}>
          <b>{monthName(tip.m.month)} {tip.m.month.slice(0, 4)}{tip.m.partial ? ' (to date)' : ''}</b>
          <div className="row"><span>Revenue</span><span className="num">{money(tip.m.revenue)}</span></div>
          <div className="row"><span>Expenses</span><span className="num">{money(tip.m.expenses)}</span></div>
          <div className="row"><span>Profit</span><span className="num">{money(tip.m.profit)}</span></div>
        </div>,
        document.querySelector('.pnl') || document.body,
      )}
    </div>
  )
}

// Sort one bank/card line: what it is, category, business, and whether to remember it.
function SortControls({ tx, options, onSaved, forceRemember = false }) {
  const [kind, setKind] = useState(tx.kind || (tx.amount_cents < 0 ? 'expense' : 'revenue'))
  const [category, setCategory] = useState(tx.category || '')
  const [business, setBusiness] = useState(tx.business || (tx.amount_cents < 0 ? 'Shared' : 'Shirt School'))
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      const r = await api(`/api/pnl/transactions/${encodeURIComponent(tx.id)}`, { method: 'PATCH', body: JSON.stringify({ kind, category: kind === 'expense' || kind === 'revenue' ? category || null : null, business: ['expense', 'revenue', 'refund'].includes(kind) ? business : null, makeRule: remember }) })
      onSaved(r)
    } catch (e) { alert(e.message) } finally { setSaving(false) }
  }
  const cats = kind === 'revenue' ? ['Affiliate', 'YouTube / AdSense', 'Sponsorship', 'Other income'] : options.categories
  return (
    <div className="pnl-review-ctrls">
      <select className="compact" value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {(kind === 'expense' || kind === 'revenue') && (
        <select className="compact" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Category…</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      )}
      {['expense', 'revenue', 'refund'].includes(kind) && (
        <select className="compact" value={business} onChange={(e) => setBusiness(e.target.value)}>
          {[...BUSINESSES, 'Shared'].map((b) => <option key={b}>{b}</option>)}
        </select>
      )}
      {!forceRemember && (
        <label className="pnl-check" title="Sort every past and future charge from this merchant the same way">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember
        </label>
      )}
      <button className="pnl-btn small primary" disabled={saving || (kind === 'expense' && !category)} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}

function statusTag(tx) {
  if (tx.pending) return <span className="pnl-tag pending">Pending</span>
  if (tx.status === 'review') return <span className="pnl-tag review">Needs review</span>
  if (tx.status === 'suggested') return <span className="pnl-tag suggested">Suggested</span>
  return null
}

function TxTable({ txs, options, onChanged, showControls }) {
  const [open, setOpen] = useState(null)
  if (!txs.length) return <div className="pnl-empty">Nothing here.</div>
  return (
    <table>
      <thead><tr><th>Charge</th><th className="hide-sm">Sorted as</th><th className="amt">Amount</th></tr></thead>
      <tbody>
        {txs.map((t) => (
          <tr key={t.id} className="pnl-review-row" onClick={() => !showControls && setOpen(open === t.id ? null : t.id)} style={{ cursor: showControls ? 'default' : 'pointer' }}>
            <td>
              {t.payee || t.description} {statusTag(t)}
              <div className="pnl-muted">{t.bank_accounts?.institution} · {shortDate(t.posted_on)}{t.payee && t.description && t.description !== t.payee ? ` · ${t.description}` : ''}</div>
              {(showControls || open === t.id) && <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}><SortControls tx={t} options={options} onSaved={onChanged} /></div>}
            </td>
            <td className="hide-sm">
              {t.kind ? <span className="pnl-tag">{KIND_LABELS[t.kind]}{t.category ? ` · ${t.category}` : ''}</span> : <span className="pnl-tag review">Unsorted</span>}
              {t.business && <span className="pnl-tag" style={{ marginLeft: 6 }}>{t.business}</span>}
            </td>
            <td className={`amt num${t.amount_cents > 0 ? ' pnl-income' : ''}`}>{t.amount_cents > 0 ? '+' : ''}{money(t.amount_cents, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function Overview({ s, range, business, animKey, onPickBusiness, onPickCategory }) {
  const [activity, setActivity] = useState(null)
  useEffect(() => {
    setActivity(null)
    api(`/api/pnl/lines?from=${range.from}&to=${range.to}${business ? `&business=${encodeURIComponent(business)}` : ''}`)
      .then((d) => setActivity(d.lines.filter((l) => !/fee/i.test(l.label || '') || l.account !== 'kajabi' && l.account !== 'stripe').slice(0, 8)))
      .catch(() => setActivity([]))
  }, [range.from, range.to, business, animKey])

  const t = s.totals; const p = s.previous
  const margin = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 100) : null
  const isMtd = range.from === `${chicagoToday().slice(0, 7)}-01` && range.to === chicagoToday()
  const oneMonth = range.from.slice(0, 7) === range.to.slice(0, 7) // month-over-month compare only makes sense within a month
  const prevLabel = isMtd ? `same point ${monthName(p.from)}` : monthName(p.from)
  return (
    <section className="pnl-grid">
      <Kpi title="Revenue" cents={t.revenue} delay={0.05} animKey={animKey} meta={`${shortDate(range.from)} – ${shortDate(range.to)}`} right={oneMonth ? <Delta now={t.revenue} prev={p.revenue} label={prevLabel} /> : <span />} />
      <Kpi title="Expenses" cents={t.expenses} delay={0.12} animKey={animKey} meta={business ? 'Direct costs only (shared costs not split)' : `${s.expenseCount} bank & card charges`} right={oneMonth ? <Delta now={t.expenses} prev={p.expenses} label={prevLabel} goodWhenUp={false} /> : <span />} />
      <Kpi title="Profit" cents={t.profit} delay={0.19} animKey={animKey} className={t.profit >= 0 ? 'profit' : 'loss'}
        extra={margin != null && <span className="pnl-margin">{margin}% margin</span>}
        meta={isMtd ? 'Month to date' : 'For this period'} right={<span>{range.to.slice(0, 4)} so far: <b className="num">{money(s.ytd.profit)}</b></span>} />

      <div className="pnl-card s8" style={{ animationDelay: '.26s' }}>
        <div className="pnl-head">
          <div><h3>{range.to.slice(0, 4)} by month</h3><div className="pnl-sub">{business || 'All businesses'} · this month is to date</div></div>
          <div className="pnl-legend">
            <span><i style={{ background: 'var(--p-rev)' }} />Revenue</span>
            <span><i style={{ background: 'var(--p-exp)' }} />Expenses</span>
            <span><i className="line" style={{ background: 'var(--p-profit)' }} />Profit</span>
          </div>
        </div>
        <TrendChart monthly={s.monthly} key={animKey} />
      </div>

      <div className="pnl-card s4" style={{ animationDelay: '.33s' }}>
        <h3>Revenue by business</h3>
        <div className="pnl-sub">Tap one to filter</div>
        <BarList rows={s.revenueByBusiness.map((b) => ({ label: b.business, cents: b.cents }))} color="linear-gradient(90deg, #256abf, #3987e5)" onPick={(r) => onPickBusiness(r.label)} />
      </div>

      <div className="pnl-card s5" style={{ animationDelay: '.4s' }}>
        <h3>Expenses by category</h3>
        <div className="pnl-sub">{business ? `${business} · direct costs` : 'All businesses'}</div>
        <BarList rows={s.expensesByCategory.slice(0, 9).map((c) => ({ label: c.category, cents: c.cents }))} color="linear-gradient(90deg, #b8471b, #d95926)" onPick={(r) => onPickCategory(r.label)} empty="No expenses in this period yet" />
      </div>

      <div className="pnl-card s7" style={{ animationDelay: '.47s' }}>
        <div className="pnl-head"><div><h3>Latest activity</h3><div className="pnl-sub">Sales, income and costs in one feed</div></div></div>
        {activity == null ? (
          <div className="pnl-list">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pnl-skel line" />)}</div>
        ) : activity.length ? (
          <table><tbody>
            {activity.map((l) => (
              <tr key={l.ref}>
                <td>{l.label}<div className="pnl-muted">{SOURCE_NAMES[l.account] || l.account} · {shortDate(l.date)}{l.pending ? ' · pending' : ''}</div></td>
                <td className="hide-sm"><span className={`pnl-tag${l.group === 'Uncategorized' ? ' review' : ''}`}>{l.group === l.label ? 'Sale' : l.group}</span></td>
                <td className="hide-sm"><span className="pnl-tag">{l.business}</span></td>
                <td className={`amt num${l.type === 'income' && l.cents > 0 ? ' pnl-income' : ''}`}>{l.type === 'income' ? (l.cents >= 0 ? '+' : '') + money(l.cents, true) : money(-l.cents, true)}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <div className="pnl-empty">No activity in this period.</div>}
      </div>
    </section>
  )
}

function RevenueTab({ s, onPickBusiness }) {
  const byProduct = s.revenueByProduct
  return (
    <>
      <section className="pnl-grid">
        <div className="pnl-card s5">
          <h3>Revenue by business</h3>
          <div className="pnl-sub">{shortDate(s.period.from)} – {shortDate(s.period.to)}</div>
          <BarList rows={s.revenueByBusiness.map((b) => ({ label: b.business, cents: b.cents }))} color="linear-gradient(90deg, #256abf, #3987e5)" onPick={(r) => onPickBusiness(r.label)} />
        </div>
        <div className="pnl-card s7">
          <h3>Revenue by product</h3>
          <div className="pnl-sub">{s.period.business || 'All businesses'} · refunds shown as negatives</div>
          {byProduct.length ? (
            <table>
              <thead><tr><th>Product</th><th className="hide-sm">Business</th><th className="amt hide-sm">Sales</th><th className="amt">Revenue</th></tr></thead>
              <tbody>{byProduct.map((p) => (
                <tr key={p.business + p.product}><td>{p.product}</td><td className="hide-sm"><span className="pnl-tag">{p.business}</span></td><td className="amt hide-sm pnl-muted">{p.count}</td><td className="amt num">{money(p.cents)}</td></tr>
              ))}</tbody>
            </table>
          ) : <div className="pnl-empty">No revenue in this period.</div>}
        </div>
      </section>
      <div className="pnl-legacy">
        <h2>Sales log, manual entries and Slack sale alerts</h2>
        <SalesAnalytics />
      </div>
    </>
  )
}

function ExpensesTab({ s, range, options, category, setCategory, onChanged }) {
  const [txs, setTxs] = useState(null)
  const [q, setQ] = useState('')
  const load = useCallback(() => {
    api(`/api/pnl/transactions?from=${range.from}&to=${range.to}&limit=2000`).then((d) => setTxs(d.transactions)).catch(() => setTxs([]))
  }, [range.from, range.to])
  useEffect(() => { load() }, [load])
  const shown = useMemo(() => (txs || []).filter((t) => {
    if (category && (t.category || 'Uncategorized') !== category) return false
    if (q && !`${t.payee} ${t.description}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [txs, q, category])
  return (
    <section className="pnl-grid">
      <div className="pnl-card s4">
        <h3>Expenses by category</h3>
        <div className="pnl-sub">Tap one to filter the list</div>
        <BarList rows={s.expensesByCategory.map((c) => ({ label: c.category, cents: c.cents }))} color="linear-gradient(90deg, #b8471b, #d95926)" onPick={(r) => setCategory(category === r.label ? null : r.label)} empty="No expenses yet" />
      </div>
      <div className="pnl-card s8">
        <div className="pnl-head">
          <div><h3>Bank & card activity</h3><div className="pnl-sub">{category ? `${category} · ` : ''}Tap a line to change how it's sorted</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {category && <button className="pnl-btn small" onClick={() => setCategory(null)}>Clear filter</button>}
            <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {txs == null ? <div className="pnl-skel" style={{ marginTop: 16 }} /> : <TxTable txs={shown} options={options} onChanged={() => { load(); onChanged() }} />}
      </div>
    </section>
  )
}

// One row per merchant: saving sorts all its charges and remembers the merchant.
function ReviewGroups({ txs, options, onChanged }) {
  const groups = useMemo(() => {
    const m = new Map()
    for (const t of txs) {
      // Same merchant even when the bank adds a booking code ("AIRBNB * HMJ8…"); matches the server's rule pattern
      const merchant = (t.payee || t.description || '').toLowerCase().replace(/[#*].*$/, '').replace(/\s+\d[\d\s-]*$/, '').trim()
      const key = `${merchant}|${t.amount_cents < 0 ? 'out' : 'in'}|${t.bank_accounts?.institution}`
      const g = m.get(key) || { key, first: t, items: [], cents: 0 }
      g.items.push(t); g.cents += t.amount_cents
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
  }, [txs])
  return (
    <table>
      <thead><tr><th>Merchant</th><th className="amt">Total</th></tr></thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.key} className="pnl-review-row">
            <td>
              {g.first.payee || g.first.description} {statusTag(g.first)}
              <div className="pnl-muted">{g.first.bank_accounts?.institution} · {g.items.length > 1 ? `${g.items.length} charges, latest ${shortDate(g.first.posted_on)}` : shortDate(g.first.posted_on)} · {g.first.description}</div>
              <div style={{ marginTop: 8 }}><SortControls tx={g.first} options={options} onSaved={onChanged} forceRemember /></div>
            </td>
            <td className={`amt num${g.cents > 0 ? ' pnl-income' : ''}`}>{g.cents > 0 ? '+' : ''}{money(g.cents, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReviewTab({ options, onChanged }) {
  const [txs, setTxs] = useState(null)
  const load = useCallback(() => { api('/api/pnl/transactions?status=review,suggested&limit=1000').then((d) => setTxs(d.transactions)).catch(() => setTxs([])) }, [])
  useEffect(() => { load() }, [load])
  const suggested = (txs || []).filter((t) => t.status === 'suggested').length
  const accept = async () => { await api('/api/pnl/review/accept', { method: 'POST', body: JSON.stringify({}) }); load(); onChanged() }
  return (
    <section className="pnl-grid">
      <div className="pnl-card s12">
        <div className="pnl-head">
          <div><h3>Needs review</h3><div className="pnl-sub">Merchants the rules don't know yet, or Eddie's guesses. Saving one sorts every charge from that merchant, now and later.</div></div>
          {suggested > 0 && <button className="pnl-btn primary" onClick={accept}>Accept all {suggested} suggestions</button>}
        </div>
        {txs == null ? <div className="pnl-skel" style={{ marginTop: 16 }} /> : txs.length ? <ReviewGroups txs={txs} options={options} onChanged={() => { load(); onChanged() }} /> : <div className="pnl-empty">All caught up. Everything is sorted.</div>}
      </div>
    </section>
  )
}

function ExportTab({ business }) {
  const year = chicagoToday().slice(0, 4)
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(chicagoToday())
  const [biz, setBiz] = useState(business || '')
  const qs = `from=${from}&to=${to}${biz ? `&business=${encodeURIComponent(biz)}` : ''}`
  return (
    <section className="pnl-grid">
      <div className="pnl-card s12 pnl-export-card">
        <h3>Export for the CPA</h3>
        <p>Two CSV files that open in Excel or Google Sheets. <b>Transactions</b> lists every income and expense line with its category and business. <b>Monthly summary</b> is the P&L by category, one column per month, with net profit at the bottom. Transfers between your own accounts and payouts already counted as sales are left out, and owner draws are listed separately.</p>
        <div className="pnl-export-row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="pnl-muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <select value={biz} onChange={(e) => setBiz(e.target.value)}>
            <option value="">All businesses</option>
            {BUSINESSES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="pnl-export-row">
          <a className="pnl-btn primary" href={`/api/pnl/export?type=lines&${qs}`}>Download transactions</a>
          <a className="pnl-btn" href={`/api/pnl/export?type=summary&${qs}`}>Download monthly summary</a>
        </div>
      </div>
    </section>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PnL() {
  const [tab, setTab] = useState('overview')
  const [business, setBusiness] = useState(null)
  const [preset, setPreset] = useState('mtd')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [s, setS] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useInflight()
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [category, setCategory] = useState(null)
  const [options, setOptions] = useState({ categories: [] })
  const range = useMemo(() => presetRange(preset, custom), [preset, custom])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      setError(null)
      const d = await api(`/api/pnl/summary?from=${range.from}&to=${range.to}${business ? `&business=${encodeURIComponent(business)}` : ''}`)
      setS(d); setAnimKey((k) => k + 1)
    } catch (e) { setError(e.message) } finally { setRefreshing(false) }
  }, [range.from, range.to, business])
  useEffect(() => { load() }, [load])
  useEffect(() => { api('/api/pnl/options').then(setOptions).catch(() => {}) }, [])

  const sync = async () => {
    setSyncing(true)
    try { await api('/api/pnl/sync', { method: 'POST', body: '{}' }); await load() } catch (e) { setError(e.message) } finally { setSyncing(false) }
  }

  const stale = s?.freshness?.accounts?.filter((a) => a.newest && (Date.now() - new Date(a.newest + 'T12:00:00')) / 86400000 > 10) || []

  return (
    <div className="pnl">
      <div className={`pnl-loadbar${busy ? ' on' : ''}`} role="progressbar" aria-hidden={!busy} aria-label="Loading" />
      <div className={`pnl-wrap${refreshing && s ? ' pnl-dim' : ''}`}>
        <header className="pnl-header">
          <div>
            <h1>Profit &amp; Loss</h1>
            <div className="pnl-fresh">
              <span><i className="pnl-dot" />Stripe &amp; Kajabi live</span>
              <span>Banks &amp; cards synced {ago(s?.freshness?.bankSyncedAt)}</span>
              {stale.length > 0 && <span className="hide-sm" title={stale.map((a) => `${a.name}: newest charge ${a.newest}`).join('\n')}>No new charges lately: {[...new Set(stale.map((a) => a.name.split(' · ')[0].replace('American Express', 'Amex').replace(' Bank', '')))].join(', ')}</span>}
            </div>
          </div>
          <div className="pnl-actions">
            <button className="pnl-btn hide-sm" onClick={sync} disabled={syncing}>{syncing ? <><span className="pnl-spin">↻</span> Syncing</> : 'Sync now'}</button>
            <button className="pnl-btn primary" onClick={() => setTab('export')}>Export<span className="hide-sm"> for CPA</span></button>
          </div>
        </header>

        <nav className="pnl-tabs">
          {[['overview', 'Overview'], ['revenue', 'Revenue'], ['expenses', 'Expenses'], ['review', 'Needs review', 'Review'], ['export', 'Export']].map(([id, label, short]) => (
            <button key={id} className={`pnl-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
              {short ? <><span className="pnl-full">{label}</span><span className="pnl-short">{short}</span></> : label}{id === 'review' && s?.reviewCount > 0 && <span className="pnl-badge">{s.reviewCount}</span>}
            </button>
          ))}
        </nav>

        {tab !== 'export' && tab !== 'review' && (
          <div className="pnl-filters">
            <div className="pnl-chips">
              <button className={`pnl-chip${!business ? ' on' : ''}`} onClick={() => setBusiness(null)}>All businesses</button>
              {BUSINESSES.map((b) => <button key={b} className={`pnl-chip${business === b ? ' on' : ''}`} onClick={() => setBusiness(business === b ? null : b)}>{b}</button>)}
            </div>
            <div className="pnl-period">
              <select className="pnl-biz-select" value={business || ''} onChange={(e) => setBusiness(e.target.value || null)} aria-label="Business">
                <option value="">All businesses</option>
                {BUSINESSES.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                <option value="mtd">This month</option>
                <option value="last">Last month</option>
                <option value="ytd">This year</option>
                <option value="lastyear">Last year</option>
                <option value="custom">Custom range…</option>
              </select>
              {preset === 'custom' && (<>
                <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </>)}
            </div>
          </div>
        )}

        {error && <div className="pnl-error">{error}</div>}
        {!s && !error && <section className="pnl-grid"><div className="pnl-skel s4" /><div className="pnl-skel s4" /><div className="pnl-skel s4" /><div className="pnl-skel s8" style={{ height: 340 }} /><div className="pnl-skel s4" style={{ height: 340 }} /></section>}

        {s && tab === 'overview' && <Overview s={s} range={range} business={business} animKey={animKey} onPickBusiness={setBusiness} onPickCategory={(c) => { setCategory(c); setTab('expenses') }} />}
        {s && tab === 'revenue' && <RevenueTab s={s} onPickBusiness={setBusiness} />}
        {s && tab === 'expenses' && <ExpensesTab s={s} range={range} options={options} category={category} setCategory={setCategory} onChanged={load} />}
        {tab === 'review' && <ReviewTab options={options} onChanged={load} />}
        {tab === 'export' && <ExportTab business={business} />}
      </div>
    </div>
  )
}
