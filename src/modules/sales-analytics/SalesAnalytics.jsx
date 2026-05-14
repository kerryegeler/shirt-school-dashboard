import { useState, useEffect, useCallback } from 'react'
import {
  fetchSalesSummary, fetchRevenueEntries, addRevenueEntry,
  deleteRevenueEntry, backfillKajabi, backfillStripe,
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

const MANUAL_SOURCES = ['paypal', 'partnerstack', 'impact', 'bank_deposit', 'adsense', 'affiliate_other', 'other']
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

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await addRevenueEntry({
        source, amount: parseFloat(amount), received_at: receivedAt, description,
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

          <label className="sa-label">Amount (USD)</label>
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

          <label className="sa-label">Date received</label>
          <input
            className="sa-input"
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            required
          />

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
  const [loading, setLoading] = useState(true)
  const [filterSource, setFilterSource] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, e] = await Promise.all([
        fetchSalesSummary(),
        fetchRevenueEntries({ source: filterSource || undefined, limit: 100 }),
      ])
      setSummary(s)
      setEntries(e)
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setLoading(false)
  }, [filterSource])

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

  async function handleBackfillStripe() {
    setSyncing(true); setSyncMsg('Pulling last 90 days from Stripe…')
    try {
      const r = await backfillStripe(90)
      const parts = [`Scanned ${r.scanned || 0} Stripe charges`, `imported ${r.inserted}`]
      if (r.errors?.length) parts.push(`errors: ${r.errors.join('; ')}`)
      setSyncMsg(parts.join(' · '))
      await load()
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 12000)
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
          <button className="btn btn-ghost" onClick={handleBackfillKajabi} disabled={syncing}>Backfill Kajabi</button>
          <button className="btn btn-ghost" onClick={handleBackfillStripe} disabled={syncing}>Sync Stripe (90d)</button>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
          {syncMsg && <span className="sa-msg">{syncMsg}</span>}
        </div>

        {loading && !summary && <div className="sa-loading"><div className="sa-spinner" /></div>}

        {summary && (
          <>
            <div className="sa-stat-grid">
              <div className="sa-stat">
                <div className="sa-stat-label">Month to Date</div>
                <div className="sa-stat-value">{formatMoney(summary.mtd_cents)}</div>
                <div className="sa-stat-sub">{new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}</div>
              </div>
              <div className="sa-stat">
                <div className="sa-stat-label">Last 12 Months</div>
                <div className="sa-stat-value">{formatMoney((summary.monthly || []).reduce((sum, m) => sum + (m.cents || 0), 0))}</div>
                <div className="sa-stat-sub">{summary.total_entries} entries</div>
              </div>
            </div>

            <div className="sa-card">
              <div className="sa-card-title">Monthly Revenue (last 12 months)</div>
              <MonthlyChart months={summary.monthly} />
            </div>

            <div className="sa-card">
              <div className="sa-card-title-row">
                <div className="sa-card-title">Recent Entries</div>
                <select className="sa-filter" value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                  <option value="">All sources</option>
                  {Object.keys(SOURCE_LABELS).map((s) => (
                    <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              {entries.length === 0 && (
                <div className="sa-empty">No entries{filterSource ? ' for this source' : ' yet'}. Add one or backfill.</div>
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
