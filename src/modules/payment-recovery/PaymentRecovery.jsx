import { useState, useEffect, useCallback } from 'react'
import {
  fetchFailedPayments, syncKajabi, startRecoverySequence,
  fetchRecoverySequence, cancelRecoverySequence, fetchRecoverySequences,
} from '../../services/api.js'
import './PaymentRecovery.css'

function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '—'
  const v = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${currency === 'USD' ? '$' : currency + ' '}${v}`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function StatusBadge({ status }) {
  const map = {
    active: { label: 'Active', cls: 'pr-badge--active' },
    paid: { label: '✓ Paid', cls: 'pr-badge--paid' },
    cancelled: { label: 'Cancelled', cls: 'pr-badge--cancelled' },
    revocation_needed: { label: '⚠ Revoke', cls: 'pr-badge--warn' },
    revoked: { label: 'Revoked', cls: 'pr-badge--cancelled' },
    pending: { label: 'Pending', cls: 'pr-badge--pending' },
    sent: { label: '✓ Sent', cls: 'pr-badge--paid' },
    failed: { label: '✗ Failed', cls: 'pr-badge--warn' },
  }
  const m = map[status] || { label: status || '—', cls: '' }
  return <span className={`pr-badge ${m.cls}`}>{m.label}</span>
}

// ─── Failed Payments Tab ──────────────────────────────────────────────────────

function FailedPaymentsTab({ onOpenSequence }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchFailedPayments('failed')
      setPayments(data)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSync() {
    setSyncing(true)
    setMsg('Scanning Gmail for failure notifications…')
    try {
      const result = await syncKajabi()
      await load()
      const found = result?.newFailures || 0
      const total = result?.totalFailures || 0
      setMsg(found > 0
        ? `Found ${found} new failed payment${found === 1 ? '' : 's'}. (${total} total)`
        : `No new failed payments. (${total} total tracked)`)
      setTimeout(() => setMsg(''), 5000)
    } catch (err) {
      setMsg(`Error: ${err.message}`)
    }
    setSyncing(false)
  }

  async function handleStart(payment) {
    if (!confirm(`Start recovery sequence for ${payment.customer_email}?\n\nFirst email will send immediately, then follow-ups on Day 5 and Day 10.`)) return
    setBusyId(payment.id)
    try {
      const seq = await startRecoverySequence(payment.id)
      await load()
      onOpenSequence?.(seq.id)
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
    setBusyId(null)
  }

  return (
    <div className="pr-panel">
      <div className="pr-toolbar">
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Scanning…' : '↻ Scan Inbox for Failures'}
        </button>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
        {msg && <span className="pr-msg">{msg}</span>}
      </div>

      {loading && <div className="pr-loading"><div className="pr-spinner" /></div>}

      {!loading && payments.length === 0 && (
        <div className="pr-empty">
          <div>No failed payments.</div>
          <div className="pr-empty-sub">Click "Sync from Kajabi" to fetch the latest data.</div>
        </div>
      )}

      {!loading && payments.length > 0 && (
        <div className="pr-table">
          <div className="pr-row pr-row--header">
            <div>Customer</div>
            <div>Product</div>
            <div>Amount</div>
            <div>Failed</div>
            <div>Recovery</div>
            <div></div>
          </div>
          {payments.map((p) => {
            const seq = p.sequence
            const days = daysSince(p.failed_at)
            return (
              <div key={p.id} className="pr-row">
                <div className="pr-customer">
                  <div className="pr-customer-name">{p.customer_name || '—'}</div>
                  <div className="pr-customer-email">{p.customer_email}</div>
                </div>
                <div className="pr-product">{p.product_name || '—'}</div>
                <div className="pr-amount">{formatMoney(p.amount_cents, p.currency)}</div>
                <div className="pr-failed">
                  <div>{formatDate(p.failed_at)}</div>
                  {days != null && <div className="pr-days">{days}d ago</div>}
                </div>
                <div>{seq ? <StatusBadge status={seq.status} /> : <span className="pr-na">—</span>}</div>
                <div className="pr-actions">
                  {seq && seq.status === 'active' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenSequence(seq.id)}>View</button>
                  ) : seq ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenSequence(seq.id)}>Details</button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleStart(p)}
                      disabled={busyId === p.id || !p.customer_email}
                    >
                      {busyId === p.id ? 'Starting…' : 'Start Recovery'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Successful Payments Tab ──────────────────────────────────────────────────

function SuccessfulPaymentsTab() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchFailedPayments('success')
      setPayments(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="pr-panel">
      <div className="pr-toolbar">
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
        <span className="pr-msg">Updates automatically when Kajabi fires the Payment Succeeded webhook.</span>
      </div>
      {loading && <div className="pr-loading"><div className="pr-spinner" /></div>}
      {!loading && payments.length === 0 && (
        <div className="pr-empty">
          <div>No successful payments recorded yet.</div>
          <div className="pr-empty-sub">Make sure the Payment Succeeded webhook is configured in Kajabi.</div>
        </div>
      )}
      {!loading && payments.length > 0 && (
        <div className="pr-table">
          <div className="pr-row pr-row--5col">
            <div className="pr-customer-name" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recorded</div>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="pr-row pr-row--5col">
              <div className="pr-customer">
                <div className="pr-customer-name">{p.customer_name || '—'}</div>
                <div className="pr-customer-email">{p.customer_email || '—'}</div>
              </div>
              <div>{p.product_name || '—'}</div>
              <div className="pr-amount">{formatMoney(p.amount_cents, p.currency)}</div>
              <div style={{ textTransform: 'capitalize' }}>{(p.type || '—').replace(/_/g, ' ')}</div>
              <div>{formatDate(p.synced_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Active Recoveries Tab ────────────────────────────────────────────────────

function ActiveRecoveriesTab({ onOpenSequence }) {
  const [seqs, setSeqs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchRecoverySequences('active')
      setSeqs(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="pr-panel">
      <div className="pr-toolbar">
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loading && <div className="pr-loading"><div className="pr-spinner" /></div>}
      {!loading && seqs.length === 0 && <div className="pr-empty">No active recovery sequences.</div>}
      {!loading && seqs.length > 0 && (
        <div className="pr-table">
          <div className="pr-row pr-row--header">
            <div>Customer</div>
            <div>Product</div>
            <div>Started</div>
            <div>Status</div>
            <div></div>
          </div>
          {seqs.map((s) => (
            <div key={s.id} className="pr-row pr-row--5col">
              <div className="pr-customer">
                <div className="pr-customer-name">{s.customer_name || '—'}</div>
                <div className="pr-customer-email">{s.customer_email}</div>
              </div>
              <div>{s.product_name || '—'}</div>
              <div>{formatDate(s.started_at)}</div>
              <div><StatusBadge status={s.status} /></div>
              <div className="pr-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenSequence(s.id)}>View</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ onOpenSequence }) {
  const [seqs, setSeqs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchRecoverySequences()
      setSeqs(data.filter((s) => s.status !== 'active'))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="pr-panel">
      <div className="pr-toolbar">
        <button className="btn btn-ghost" onClick={load} disabled={loading}>Refresh</button>
      </div>
      {loading && <div className="pr-loading"><div className="pr-spinner" /></div>}
      {!loading && seqs.length === 0 && <div className="pr-empty">No completed recoveries yet.</div>}
      {!loading && seqs.length > 0 && (
        <div className="pr-table">
          <div className="pr-row pr-row--header">
            <div>Customer</div>
            <div>Product</div>
            <div>Started</div>
            <div>Outcome</div>
            <div></div>
          </div>
          {seqs.map((s) => (
            <div key={s.id} className="pr-row pr-row--5col">
              <div className="pr-customer">
                <div className="pr-customer-name">{s.customer_name || '—'}</div>
                <div className="pr-customer-email">{s.customer_email}</div>
              </div>
              <div>{s.product_name || '—'}</div>
              <div>{formatDate(s.started_at)}</div>
              <div><StatusBadge status={s.status} /></div>
              <div className="pr-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenSequence(s.id)}>View</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sequence Detail Drawer ───────────────────────────────────────────────────

function SequenceDetail({ sequenceId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchRecoverySequence(sequenceId)
      setData(d)
    } catch {}
    setLoading(false)
  }, [sequenceId])

  useEffect(() => { load() }, [load])

  async function handleCancel() {
    if (!confirm('Cancel this recovery sequence? Any pending emails will not be sent.')) return
    setCancelling(true)
    try {
      await cancelRecoverySequence(sequenceId)
      await load()
      onChanged?.()
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
    setCancelling(false)
  }

  return (
    <div className="pr-drawer-overlay" onClick={onClose}>
      <div className="pr-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pr-drawer-header">
          <h3>Recovery Sequence</h3>
          <button className="pr-icon-btn" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="pr-loading"><div className="pr-spinner" /></div>}

        {!loading && data && (
          <div className="pr-drawer-body">
            <div className="pr-detail-card">
              <div className="pr-detail-row">
                <div className="pr-detail-label">Customer</div>
                <div>{data.sequence.customer_name || '—'}<br /><span className="pr-customer-email">{data.sequence.customer_email}</span></div>
              </div>
              <div className="pr-detail-row">
                <div className="pr-detail-label">Product</div>
                <div>{data.sequence.product_name || '—'}</div>
              </div>
              <div className="pr-detail-row">
                <div className="pr-detail-label">Started</div>
                <div>{formatDate(data.sequence.started_at)}</div>
              </div>
              <div className="pr-detail-row">
                <div className="pr-detail-label">Status</div>
                <div><StatusBadge status={data.sequence.status} /></div>
              </div>
            </div>

            <div className="pr-emails-section">
              <h4>Email Sequence</h4>
              {data.emails.map((e) => (
                <div key={e.id} className={`pr-email-row pr-email--${e.status}`}>
                  <div className="pr-email-step">Step {e.step}</div>
                  <div className="pr-email-info">
                    <div className="pr-email-subject">{e.subject}</div>
                    <div className="pr-email-meta">
                      {e.status === 'sent'
                        ? `Sent ${new Date(e.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                        : e.status === 'pending'
                          ? `Scheduled ${new Date(e.scheduled_for).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                          : e.status === 'cancelled' ? 'Cancelled'
                            : e.status === 'failed' ? `Failed: ${e.error_message || 'unknown error'}`
                              : e.status}
                    </div>
                  </div>
                  <div><StatusBadge status={e.status} /></div>
                </div>
              ))}
            </div>

            {data.sequence.status === 'active' && (
              <div className="pr-drawer-footer">
                <button className="btn btn-ghost" onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel Sequence'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PaymentRecovery() {
  const [tab, setTab] = useState('failed')
  const [openSequenceId, setOpenSequenceId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="payment-recovery">
      <div className="page-header">
        <div className="page-header-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="14" height="10" rx="2" />
            <path d="M1 6h14" />
            <path d="M4 10h3" />
          </svg>
        </div>
        <div>
          <div className="page-header-title">Payment Recovery</div>
          <div className="page-header-subtitle">Failed Kajabi payments and recovery sequences</div>
        </div>
      </div>

      <div className="pr-tabs">
        <button className={`pr-tab ${tab === 'failed' ? 'active' : ''}`} onClick={() => setTab('failed')}>Failed Payments</button>
        <button className={`pr-tab ${tab === 'successful' ? 'active' : ''}`} onClick={() => setTab('successful')}>Successful Payments</button>
        <button className={`pr-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active Recoveries</button>
        <button className={`pr-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      <div className="pr-content" key={refreshKey}>
        {tab === 'failed' && <FailedPaymentsTab onOpenSequence={setOpenSequenceId} />}
        {tab === 'successful' && <SuccessfulPaymentsTab />}
        {tab === 'active' && <ActiveRecoveriesTab onOpenSequence={setOpenSequenceId} />}
        {tab === 'history' && <HistoryTab onOpenSequence={setOpenSequenceId} />}
      </div>

      {openSequenceId && (
        <SequenceDetail
          sequenceId={openSequenceId}
          onClose={() => setOpenSequenceId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
