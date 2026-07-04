import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchSocialProofPurchases } from '../../services/api.js'
import './SocialProof.css'

// Defaults mirror widgets/social-proof.js — keep the two in sync.
const DEFAULTS = {
  product: 'launch your brand challenge',
  message: '{name}{from} just grabbed their ticket to the Launch Your Brand Challenge!',
  position: 'bottom-left',
  accent: '#e02b20',
  delay: 6,
  duration: 7,
  gap: 14,
  days: 45,
  limit: 60,
  shuffle: true,
}

const IconMegaphone = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6.5v3l2 .5 1.5 3.5 1.5-.5-1-3L14 12V2L4 6l-2 .5z" />
  </svg>
)
const IconPerson = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5-9-5.5z" /></svg>
)

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms) || ms < 0) return 'recently'
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  if (d <= 7) return `${d} day${d === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function renderMessage(template, ev) {
  const fromText = ev.location ? ` from ${ev.location}` : ''
  const text = template.replace('{from}', fromText)
  const parts = text.split('{name}')
  if (parts.length === 1) return text
  return (
    <>
      {parts[0]}
      <b>{ev.name || 'Someone'}</b>
      {parts.slice(1).join('{name}')}
    </>
  )
}

export default function SocialProof() {
  const [config, setConfig] = useState(DEFAULTS)
  const [purchases, setPurchases] = useState([])
  const [embedBase, setEmbedBase] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)

  const set = (key) => (e) => setConfig((c) => ({ ...c, [key]: e.target.value }))

  const load = useCallback(async (product, days) => {
    setLoading(true)
    setError('')
    try {
      const d = await fetchSocialProofPurchases({ product, days, limit: 200 })
      setPurchases(d.purchases || [])
      setEmbedBase(d.embedBase)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load on mount + whenever the product filter settles (debounced).
  useEffect(() => {
    const t = setTimeout(() => load(config.product, config.days), 400)
    return () => clearTimeout(t)
  }, [config.product, config.days, load])

  // The base URL that goes in the embed snippet. Prefer the deployed URL the
  // server reports; window.origin is only right when viewing the deployed app.
  const base = embedBase || window.location.origin

  const snippet = useMemo(() => {
    const attrs = [
      `src="${base}/widgets/social-proof.js"`,
      `data-product="${config.product.replace(/"/g, '&quot;')}"`,
      `data-message="${config.message.replace(/"/g, '&quot;')}"`,
      `data-position="${config.position}"`,
      `data-accent="${config.accent}"`,
    ]
    if (Number(config.delay) !== DEFAULTS.delay) attrs.push(`data-delay="${config.delay}"`)
    if (Number(config.duration) !== DEFAULTS.duration) attrs.push(`data-duration="${config.duration}"`)
    if (Number(config.gap) !== DEFAULTS.gap) attrs.push(`data-gap="${config.gap}"`)
    if (Number(config.days) !== DEFAULTS.days) attrs.push(`data-days="${config.days}"`)
    if (Number(config.limit) !== DEFAULTS.limit) attrs.push(`data-limit="${config.limit}"`)
    if (!config.shuffle) attrs.push('data-shuffle="0"')
    return `<script ${attrs.join(' ')} async></script>`
  }, [base, config])

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  // Inject the REAL widget onto this page in test mode so Kerry sees exactly
  // what visitors will see. Cleaned up on re-run / unmount.
  function cleanupDemo() {
    document.querySelectorAll('[data-ss-social-proof], script[data-sp-demo]').forEach((el) => el.remove())
    try { sessionStorage.removeItem('ss_social_proof_dismissed') } catch {}
  }

  function runDemo() {
    cleanupDemo()
    const s = document.createElement('script')
    s.src = `/widgets/social-proof.js?t=${Date.now()}` // bust cache so config edits apply
    s.setAttribute('data-sp-demo', '1')
    s.dataset.product = config.product
    s.dataset.message = config.message
    s.dataset.position = config.position
    s.dataset.accent = config.accent
    s.dataset.duration = String(config.duration)
    s.dataset.gap = '3'
    if (!config.shuffle) s.dataset.shuffle = '0'
    s.dataset.test = '1'
    document.body.appendChild(s)
    setDemoRunning(true)
    setTimeout(() => setDemoRunning(false), 25000)
  }

  useEffect(() => cleanupDemo, [])

  const previewEvent = purchases[0] || { name: 'Joe', location: 'Florida', at: new Date(Date.now() - 12 * 60000).toISOString() }
  const namedCount = purchases.filter((p) => p.name).length

  return (
    <div className="social-proof">
      <div className="page-header">
        <div className="page-header-icon"><IconMegaphone /></div>
        <div>
          <div className="page-header-title">Social Proof</div>
          <div className="page-header-subtitle">Purchase popups for your landing pages</div>
        </div>
      </div>

      <div className="sp-body">
        {/* ── Left: what visitors will see ── */}
        <div className="sp-panel">
          <div className="sp-panel-title">Popup preview</div>

          <div className="sp-preview-stage">
            <div className="sp-popup" style={{ '--sp-accent': config.accent }}>
              <div className="sp-popup-avatar"><IconPerson /></div>
              <div className="sp-popup-txt">
                <div className="sp-popup-msg">{renderMessage(config.message, previewEvent)}</div>
                <div className="sp-popup-sub"><span className="sp-popup-check"><IconCheck /></span>{timeAgo(previewEvent.at)} · Verified purchase</div>
              </div>
            </div>
          </div>

          <button className="btn btn-secondary sp-demo-btn" onClick={runDemo} disabled={demoRunning}>
            <IconPlay /> {demoRunning ? 'Demo running (bottom of screen)…' : 'Play live demo on this page'}
          </button>

          <div className="sp-panel-title sp-feed-title">
            Purchases the popup will show
            {!loading && !error && (
              <span className="sp-feed-count">{namedCount} of {purchases.length} usable</span>
            )}
          </div>

          {loading && <div className="sp-feed-note">Loading purchases…</div>}
          {!loading && error && <div className="sp-feed-note sp-feed-error">{error}</div>}
          {!loading && !error && purchases.length === 0 && (
            <div className="sp-feed-note">
              No matching purchases found in the last {config.days} days. Purchases appear here when
              Kajabi's webhook reports a successful payment whose product name matches the filter.
              Try widening the days window or loosening the product filter.
            </div>
          )}
          {!loading && !error && purchases.length > 0 && (
            <div className="sp-feed">
              {purchases.map((p, i) => (
                <div key={i} className={`sp-feed-row ${!p.name ? 'anon' : ''}`}>
                  <span className="sp-feed-avatar"><IconPerson /></span>
                  <span className="sp-feed-name">{p.name || 'No name captured'}</span>
                  <span className="sp-feed-loc">{p.location || '—'}</span>
                  <span className="sp-feed-time">{timeAgo(p.at)}</span>
                </div>
              ))}
            </div>
          )}
          {!loading && !error && purchases.length > 0 && namedCount < purchases.length && (
            <div className="sp-feed-note">Rows without a captured name are skipped by the popup.</div>
          )}
        </div>

        {/* ── Right: configuration + embed code ── */}
        <div className="sp-panel">
          <div className="sp-panel-title">Settings</div>

          <label className="sp-label">Product filter <span className="sp-label-hint">matches the Kajabi product name, quotes/punctuation ignored</span></label>
          <input className="sp-input" value={config.product} onChange={set('product')} />

          <label className="sp-label">Popup message <span className="sp-label-hint">{'{name}'} = first name · {'{from}'} = “ from Florida” (auto-hidden if unknown)</span></label>
          <textarea className="sp-input sp-textarea" rows={3} value={config.message} onChange={set('message')} />

          <div className="sp-row">
            <div className="sp-field">
              <label className="sp-label">Position</label>
              <select className="sp-input" value={config.position} onChange={set('position')}>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </div>
            <div className="sp-field">
              <label className="sp-label">Accent color</label>
              <div className="sp-color-wrap">
                <input type="color" className="sp-color" value={config.accent} onChange={set('accent')} />
                <span className="sp-color-code">{config.accent}</span>
              </div>
            </div>
          </div>

          <div className="sp-row">
            <div className="sp-field">
              <label className="sp-label">First popup after (s)</label>
              <input type="number" min="0" className="sp-input" value={config.delay} onChange={set('delay')} />
            </div>
            <div className="sp-field">
              <label className="sp-label">Visible for (s)</label>
              <input type="number" min="2" className="sp-input" value={config.duration} onChange={set('duration')} />
            </div>
            <div className="sp-field">
              <label className="sp-label">Gap between (s)</label>
              <input type="number" min="2" className="sp-input" value={config.gap} onChange={set('gap')} />
            </div>
            <div className="sp-field">
              <label className="sp-label">Show last (days)</label>
              <input type="number" min="1" max="365" className="sp-input" value={config.days} onChange={set('days')} />
            </div>
          </div>

          <div className="sp-row">
            <div className="sp-field">
              <label className="sp-label">Pool size <span className="sp-label-hint">how many recent buyers to rotate through (max 200)</span></label>
              <input type="number" min="1" max="200" className="sp-input" value={config.limit} onChange={set('limit')} />
            </div>
            <div className="sp-field">
              <label className="sp-label">Order <span className="sp-label-hint">random shows different buyers on every visit</span></label>
              <select
                className="sp-input"
                value={config.shuffle ? 'random' : 'newest'}
                onChange={(e) => setConfig((c) => ({ ...c, shuffle: e.target.value === 'random' }))}
              >
                <option value="random">Random (recommended)</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
          </div>

          <div className="sp-panel-title sp-embed-title">Embed code</div>
          <div className="sp-snippet">
            <code>{snippet}</code>
          </div>
          <button className="btn btn-primary sp-copy-btn" onClick={copySnippet}>
            {copied ? <><IconCheck /> Copied!</> : <><IconCopy /> Copy embed code</>}
          </button>

          <div className="sp-howto">
            <div className="sp-howto-title">How to add it to your Kajabi page</div>
            <ol>
              <li>In Kajabi, open the Launch Your Brand Challenge landing page in the editor.</li>
              <li>Go to <b>Settings → Page Scripts</b> (or add a <b>Custom Code</b> block).</li>
              <li>Paste the embed code into the <b>Footer</b> scripts area and save.</li>
              <li>Popups rotate through real recent purchases; visitors can dismiss them for their session.</li>
            </ol>
            <div className="sp-howto-note">
              Reuse on any other page: paste the same snippet and change <code>data-product</code> and
              <code> data-message</code> to match that offer.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
