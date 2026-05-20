import { useState, useEffect, useCallback } from 'react'
import {
  fetchSalesSummary, fetchRevenueEntries, addRevenueEntry,
  deleteRevenueEntry, backfillKajabi, backfillStripe, cleanupStripeDuplicates,
  fetchSalesProducts, repairKajabi,
} from '../../services/api.js'
import './SalesAnalytics.css'

const SOURCE_LABELS = {
  kajabi: 'Kajabi',
  stripe: 'Stripe',
  paypal: 'PayPal',
  partnerstack: 'PartnerStack',
  impact: 'Impact',
  bank_deposit: 'Bank Deposit',
  adsense: 'AdSense',
  affiliate_other: 'Affiliate (Other)',
  other: 'Other',
}

// Sources available in the manual-entry dropdown. Kajabi/Stripe are normally
// automatic, but they're included here so you can manually log sales that were
// missed (e.g. webhooks lost during an outage).
const MANUAL_SOURCES = ['kajabi', 'stripe', 'paypal', 'partnerstack', 'impact', 'bank_deposit', 'adsense', 'affiliate_other', 'other']
const AUTO_SOURCES = ['kajabi', 'stripe']

function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—'
  const v = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${currency === 'USD' ? '$' : currency + ' '}${v}`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// YYYY-MM-DD for the given Date, in Chicago timezone. Aligns with server-side
// chicagoDate() so date filters match what's stored.
function chicagoDateClient(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function todayLocal() {
  return chicagoDateClient(new Date())
}

function isoDate(d) {
  return chicagoDateClient(d)
}

// Compute from/to for a named preset. All ranges are inclusive on both ends.
function rangeForPreset(preset) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const todayIso = isoDate(now)
  switch (preset) {
    case 'today':
      return { from: todayIso, to: todayIso, label: 'Today' }
    case 'yesterday': {
      const y1 = new Date(now.getTime() - 86400000)
      return { from: isoDate(y1), to: isoDate(y1), label: 'Yesterday' }
    }
    case 'this_month':
      return { from: isoDate(new Date(y, m, 1)), to: todayIso, label: 'This Month' }
    case 'last_month': {
      const lastFirst = new Date(y, m - 1, 1)
      const lastEnd = new Date(y, m, 0)
      return { from: isoDate(lastFirst), to: isoDate(lastEnd), label: 'Last Month' }
    }
    case 'last_3_months':
      return { from: isoDate(new Date(now.getTime() - 90 * 86400000)), to: todayIso, label: 'Last 3 Months' }
    case 'last_6_months':
      return { from: isoDate(new Date(now.getTime() - 180 * 86400000)), to: todayIso, label: 'Last 6 Months' }
    case 'last_12_months':
      return { from: isoDate(new Date(y - 1, m, now.getDate())), to: todayIso, label: 'Last 12 Months' }
    case 'ytd':
      return { from: isoDate(new Date(y, 0, 1)), to: todayIso, label: 'Year to Date' }
    case 'all_time':
      return { from: '2000-01-01', to: todayIso, label: 'All Time' }
    default:
      return { from: todayIso, to: todayIso, label: 'Today' }
  }
}

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_3_months', label: 'Last 3 Months' },
  { id: 'last_6_months', label: 'Last 6 Months' },
  { id: 'last_12_months', label: 'Last 12 Months' },
  { id: 'ytd', label: 'Year to Date' },
  { id: 'all_time', label: 'All Time' },
  { id: 'custom', label: 'Custom Range…' },
]

// ─── Monthly bar chart (pure CSS) ─────────────────────────────────────────────

function MonthlyChart({ months }) {
  if (!months?.length) return null
  const max = Math.max(...months.map((m) => m.cents), 1)
  return (
    <div className="sa-chart">
      {months.map((m) => {
        const pct = max > 0 ? (m.cents / max) * 100 : 0
        return (
          <div key={m.month} className="sa-bar-wrap" title={`${m.label}: ${formatMoney(m.cents)}`}>
            <div className="sa-bar-value">{m.cents > 0 ? formatMoney(m.cents).replace('.00', '') : ''}</div>
            <div className="sa-bar-container">
              <div className="sa-bar" style={{ height: `${pct}%` }} />
            </div>
            <div className="sa-bar-label">{m.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Manual entry modal ───────────────────────────────────────────────────────

function AddEntryModal({ onClose, onAdded }) {
  const [source, setSource] = useState('bank_deposit')
  const [amount, setAmount] = useState('')
  const [receivedAt, setReceivedAt] = useState(todayLocal())
  const [description, setDescription] = useState('')
  const [productName, setProductName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Show the product field for sources where it matters (Kajabi/Stripe sales)
  const showProductField = source === 'kajabi' || source === 'stripe'

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await addRevenueEntry({
        source, amount: parseFloat(amount), received_at: receivedAt, description,
        product_name: productName || undefined,
        quantity: parseInt(quantity, 10) || 1,
      })
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="sa-modal-overlay" onClick={onClose}>
      <form className="sa-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="sa-modal-header">
          <h3>Add Revenue Entry</h3>
          <button type="button" className="sa-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="sa-modal-body">
          <label className="sa-label">Source</label>
          <select className="sa-input" value={source} onChange={(e) => setSource(e.target.value)}>
            {MANUAL_SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
            ))}
          </select>

          <label className="sa-label">Amount (USD) — per sale</label>
          <input
            className="sa-input"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
          />

          <label className="sa-label">Quantity (number of identical sales)</label>
          <input
            className="sa-input"
            type="number"
            step="1"
            min="1"
            max="200"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {parseInt(quantity, 10) > 1 && amount && (
            <div className="sa-qty-hint">
              Adds {quantity} entries · {formatMoney(Math.round(parseFloat(amount || 0) * 100) * (parseInt(quantity, 10) || 1))} total
            </div>
          )}

          <label className="sa-label">Date received</label>
          <input
            className="sa-input"
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            required
          />

          {showProductField && (
            <>
              <label className="sa-label">Product / Offer</label>
              <input
                className="sa-input"
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Launch Your Brand Challenge VIP Experience"
              />
            </>
          )}

          <label className="sa-label">Description (optional)</label>
          <input
            className="sa-input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Sponsor payment from XYZ Corp"
          />

          {error && <div className="sa-error">{error}</div>}
        </div>
        <div className="sa-modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !amount}>
            {saving ? 'Saving…' : 'Add Entry'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main module ──────────────────────────────────────────────────────────────

export default function SalesAnalytics() {
  const [summary, setSummary] = useState(null)
  const [entries, setEntries] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterSource, setFilterSource] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [periodPreset, setPeriodPreset] = useState('today')
  const [customFrom, setCustomFrom] = useState(isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [customTo, setCustomTo] = useState(todayLocal())

  // Compute current date range from preset or custom
  const range = periodPreset === 'custom'
    ? { from: customFrom, to: customTo, label: 'Custom Range' }
    : rangeForPreset(periodPreset)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, e, p] = await Promise.all([
        fetchSalesSummary({ from: range.from, to: range.to, product: filterProduct || undefined }),
        fetchRevenueEntries({
          source: filterSource || undefined,
          product: filterProduct || undefined,
          from: range.from, to: range.to,
          limit: 200,
        }),
        fetchSalesProducts().catch(() => []),
      ])
      setSummary(s)
      setEntries(e)
      setProducts(p)
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setLoading(false)
  }, [filterSource, filterProduct, range.from, range.to])

  useEffect(() => { load() }, [load])

  async function handleBackfillKajabi() {
    setSyncing(true); setSyncMsg('Backfilling Kajabi…')
    try {
      const r = await backfillKajabi()
      const parts = [`Scanned ${r.scanned || 0} successful Kajabi payments`, `imported ${r.inserted}`]
      if (r.skipped) parts.push(`skipped ${r.skipped} (no amount)`)
      if (r.errors?.length) parts.push(`errors: ${r.errors.join('; ')}`)
      setSyncMsg(parts.join(' · '))
      await load()
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 12000)
  }

  async function handleCleanupDuplicates() {
    if (!confirm('Remove duplicate Stripe entries? This keeps one entry per payment and deletes the rest.')) return
    setSyncing(true); setSyncMsg('Scanning for Stripe duplicates…')
    try {
      const r = await cleanupStripeDuplicates()
      setSyncMsg(`Kept ${r.kept}, deleted ${r.deleted} duplicate(s).`)
      await load()
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 10000)
  }

  async function handleRepairKajabi() {
    if (!confirm('This will WIPE all Kajabi revenue entries and rebuild them from the webhook log. Continue?')) return
    setSyncing(true); setSyncMsg('Rebuilding Kajabi entries from webhook log…')
    try {
      const r = await repairKajabi()
      setSyncMsg(`Reprocessed ${r.reprocessed || 0} webhook events · inserted ${r.inserted || 0} entries${r.errors?.length ? ` · errors: ${r.errors.join('; ')}` : ''}`)
      await load()
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 12000)
  }

  async function handleBackfillStripe() {
    setSyncing(true); setSyncMsg('Pulling last 12 months from Stripe… this can take 30-60 seconds')
    console.log('[Stripe Sync] Starting backfill (365 days)…')
    try {
      const r = await backfillStripe(365)
      console.log('[Stripe Sync] Result:', r)
      const parts = [`Scanned ${r.scanned || 0} Stripe charges`, `imported ${r.inserted}`]
      if (r.errors?.length) parts.push(`errors: ${r.errors.join('; ')}`)
      setSyncMsg(parts.join(' · '))
      await load()
    } catch (err) {
      console.error('[Stripe Sync] Error:', err)
      setSyncMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 15000)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this revenue entry?')) return
    try {
      await deleteRevenueEntry(id)
      await load()
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
  }

  return (
    <div className="sales-analytics">
      <div className="page-header">
        <div className="page-header-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12l3-4 3 2 3-5 3 3" />
            <path d="M2 14h12" />
          </svg>
        </div>
        <div>
          <div className="page-header-title">Sales Analytics</div>
          <div className="page-header-subtitle">Total revenue across all sources</div>
        </div>
      </div>

      <div className="sa-content">
        <div className="sa-toolbar">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Entry</button>
          <button className="btn btn-ghost" onClick={handleBackfillStripe} disabled={syncing}>Sync Stripe (12mo)</button>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
          {syncMsg && <span className="sa-msg">{syncMsg}</span>}
        </div>

        {/* Period selector */}
        <div className="sa-period-bar">
          <label className="sa-period-label">Period:</label>
          <select className="sa-filter" value={periodPreset} onChange={(e) => setPeriodPreset(e.target.value)}>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {periodPreset === 'custom' && (
            <>
              <input
                type="date"
                className="sa-filter"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="sa-period-dash">to</span>
              <input
                type="date"
                className="sa-filter"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}
          <span className="sa-period-range">
            {formatDate(range.from)} – {formatDate(range.to)}
          </span>
        </div>

        {loading && !summary && <div className="sa-loading"><div className="sa-spinner" /></div>}

        {summary && (
          <>
            <div className="sa-stat-grid">
              <div className="sa-stat sa-stat--primary">
                <div className="sa-stat-label">{range.label}{filterProduct ? ` · ${filterProduct}` : ''}</div>
                <div className="sa-stat-value">{formatMoney(summary.period_total_cents || 0)}</div>
                <div className="sa-stat-count">{summary.period_entries || 0} {summary.period_entries === 1 ? 'sale' : 'sales'}</div>
              </div>
              <div className="sa-stat">
                <div className="sa-stat-label">Year to Date</div>
                <div className="sa-stat-value">{formatMoney(summary.ytd_cents || 0)}</div>
                <div className="sa-stat-sub">{new Date().getFullYear()}</div>
              </div>
              <div className="sa-stat">
                <div className="sa-stat-label">Last 12 Months</div>
                <div className="sa-stat-value">{formatMoney((summary.monthly || []).reduce((sum, m) => sum + (m.cents || 0), 0))}</div>
                <div className="sa-stat-count">{summary.total_entries || 0} {summary.total_entries === 1 ? 'sale' : 'sales'} total</div>
              </div>
            </div>

            <div className="sa-card">
              <div className="sa-card-title">Monthly Revenue (last 12 months)</div>
              <MonthlyChart months={summary.monthly} />
            </div>

            <div className="sa-card">
              <div className="sa-card-title-row">
                <div className="sa-card-title">
                  Entries — {range.label}
                  <span className="sa-card-title-count"> · {entries.length} {entries.length === 1 ? 'sale' : 'sales'}</span>
                </div>
                <div className="sa-filters-row">
                  <select className="sa-filter" value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
                    <option value="">All products</option>
                    {products.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <select className="sa-filter" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                    <option value="">All sources</option>
                    {Object.keys(SOURCE_LABELS).map((s) => (
                      <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {entries.length === 0 && (
                <div className="sa-empty">No entries{filterSource ? ' for this source' : ''} in this period.</div>
              )}

              {entries.length > 0 && (
                <div className="sa-entries">
                  <div className="sa-entry sa-entry--header">
                    <div>Date</div>
                    <div>Source</div>
                    <div>Description</div>
                    <div>Amount</div>
                    <div></div>
                  </div>
                  {entries.map((e) => (
                    <div key={e.id} className="sa-entry">
                      <div>{formatDate(e.received_at)}</div>
                      <div>
                        <span className={`sa-source sa-source--${e.source}`}>
                          {SOURCE_LABELS[e.source] || e.source}
                          {e.entered_manually && <span className="sa-manual-flag" title="Manual entry">M</span>}
                        </span>
                      </div>
                      <div className="sa-desc">{e.description || (e.product_name) || '—'}</div>
                      <div className="sa-amount">{formatMoney(e.amount_cents, e.currency)}</div>
                      <div className="sa-row-actions">
                        <button className="sa-text-btn" onClick={() => handleDelete(e.id)} title="Delete entry">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showAdd && <AddEntryModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  )
}
