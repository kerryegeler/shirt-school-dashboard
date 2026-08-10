import { useState, useEffect, useCallback } from 'react'
import {
  fetchUtmLinks, createUtmLink, updateUtmLink, deleteUtmLink, fetchUtmStats,
} from '../../services/api.js'
import './UtmTracker.css'

// Presets for the platforms Kerry actually promotes on. Picking one fills in a
// sensible utm_medium so the tagged links stay consistent across campaigns —
// "youtube/video" every time, never "yt" one week and "you-tube" the next.
const SOURCE_PRESETS = [
  { source: 'youtube', medium: 'video', label: 'YouTube' },
  { source: 'email', medium: 'email', label: 'Email list' },
  { source: 'meta', medium: 'cpc', label: 'Meta ads' },
  { source: 'instagram', medium: 'social', label: 'Instagram' },
  { source: 'facebook', medium: 'social', label: 'Facebook' },
  { source: 'podcast', medium: 'audio', label: 'Podcast' },
]

const SOURCE_COLORS = {
  youtube: '#ff453a',
  email: '#5b9cf6',
  meta: '#8b83ff',
  facebook: '#8b83ff',
  instagram: '#f5a623',
  podcast: '#30d158',
  direct: '#8a8a8a',
}

const IconLink = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 9.5a3 3 0 004.24 0l2.12-2.12a3 3 0 00-4.24-4.24L7.56 4.2" />
    <path d="M9.5 6.5a3 3 0 00-4.24 0L3.14 8.62a3 3 0 004.24 4.24l1.06-1.06" />
  </svg>
)
const IconChart = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 14h12" /><rect x="3" y="8" width="2.5" height="4" /><rect x="7" y="5" width="2.5" height="7" /><rect x="11" y="2.5" width="2.5" height="9.5" />
  </svg>
)
const IconCode = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" />
  </svg>
)
const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4" />
  </svg>
)

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button className={`utm-copy ${copied ? 'utm-copied' : ''}`} onClick={handleCopy} title={value}>
      <IconCopy />
      {copied ? 'Copied' : label}
    </button>
  )
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms) || ms < 0) return 'just now'
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d <= 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Link builder tab ─────────────────────────────────────────────────────────

function LinkBuilder({ embedBase, onEmbedBase }) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({
    destination_url: '', campaign: '', source: 'youtube', medium: 'video', content: '', label: '', slug: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchUtmLinks()
      setLinks(d.links || [])
      onEmbedBase?.(d.embedBase)
      setError('')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [onEmbedBase])

  useEffect(() => { load() }, [load])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Host only, so the slug field reads like the finished link. Set a custom
  // domain on Railway (RAILWAY_PUBLIC_URL) and short links pick it up here.
  const shortBase = (embedBase || '').replace(/^https?:\/\//, '') || 'your-domain.com'

  function pickPreset(preset) {
    setForm((f) => ({ ...f, source: preset.source, medium: preset.medium }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createUtmLink(form)
      setForm((f) => ({ ...f, content: '', label: '', slug: '' }))
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleArchive(link) {
    await updateUtmLink(link.id, { archived: !link.archived })
    load()
  }

  async function handleDelete(link) {
    if (!confirm(`Delete "${link.label || link.slug}"? Leads already recorded against it are kept.`)) return
    await deleteUtmLink(link.id)
    load()
  }

  const visible = links.filter((l) => showArchived || !l.archived)
  const grouped = visible.reduce((acc, l) => {
    (acc[l.campaign] = acc[l.campaign] || []).push(l)
    return acc
  }, {})

  return (
    <div className="utm-body">
      <form className="utm-panel" onSubmit={handleCreate}>
        <div className="utm-panel-title">Build a link</div>
        <p className="utm-hint">
          One link per platform. Post each one in exactly one place — that's what makes
          the lead counts meaningful.
        </p>

        <label className="utm-label">
          Landing page URL
          <span className="utm-label-hint">your registration page, Kajabi or Go High Level</span>
        </label>
        <input
          className="utm-input"
          placeholder="https://kerryegeler.com/brand-brain"
          value={form.destination_url}
          onChange={set('destination_url')}
          required
        />

        <label className="utm-label">
          Campaign
          <span className="utm-label-hint">the funnel this belongs to — keep it identical across platforms</span>
        </label>
        <input
          className="utm-input"
          placeholder="webinar-aug17"
          value={form.campaign}
          onChange={set('campaign')}
          required
        />

        <label className="utm-label">Where are you posting it?</label>
        <div className="utm-presets">
          {SOURCE_PRESETS.map((p) => (
            <button
              type="button"
              key={p.source}
              className={`utm-preset ${form.source === p.source ? 'utm-preset-active' : ''}`}
              onClick={() => pickPreset(p)}
              style={{ '--utm-dot': SOURCE_COLORS[p.source] || 'var(--text-tertiary)' }}
            >
              <span className="utm-preset-dot" />
              {p.label}
            </button>
          ))}
        </div>

        <div className="utm-row">
          <div className="utm-col">
            <label className="utm-label">Source</label>
            <input className="utm-input" value={form.source} onChange={set('source')} required />
          </div>
          <div className="utm-col">
            <label className="utm-label">Medium</label>
            <input className="utm-input" value={form.medium} onChange={set('medium')} />
          </div>
        </div>

        <label className="utm-label">
          Variant <span className="utm-label-hint">optional — tells two ads or two videos apart</span>
        </label>
        <input className="utm-input" placeholder="ad-creative-b" value={form.content} onChange={set('content')} />

        <label className="utm-label">
          Short link path
          <span className="utm-label-hint">
            optional — what comes after the slash. Keep it tiny: “yt”, “ig”, “ad1”.
            Leave blank and it's built from source + campaign.
          </span>
        </label>
        <div className="utm-slug-row">
          <span className="utm-slug-prefix">{shortBase}/</span>
          <input className="utm-input" placeholder="yt" value={form.slug} onChange={set('slug')} />
        </div>

        <label className="utm-label">
          Nickname <span className="utm-label-hint">optional — only shown here</span>
        </label>
        <input className="utm-input" placeholder="YouTube — Aug 17 webinar" value={form.label} onChange={set('label')} />

        {error && <div className="utm-error">{error}</div>}

        <button className="btn btn-primary utm-submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create link'}
        </button>
      </form>

      <div className="utm-panel">
        <div className="utm-panel-title">
          Your links
          <label className="utm-toggle-archived">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {loading && <div className="utm-note">Loading…</div>}
        {!loading && visible.length === 0 && (
          <div className="utm-note">No links yet. Build one on the left and post it somewhere.</div>
        )}

        {Object.entries(grouped).map(([campaign, campaignLinks]) => (
          <div key={campaign} className="utm-campaign-group">
            <div className="utm-campaign-name">{campaign}</div>
            {campaignLinks.map((link) => (
              <div key={link.id} className={`utm-link-card ${link.archived ? 'utm-link-archived' : ''}`}>
                <div className="utm-link-head">
                  <span
                    className="utm-source-badge"
                    style={{ '--utm-dot': SOURCE_COLORS[link.source] || 'var(--text-tertiary)' }}
                  >
                    <span className="utm-preset-dot" />
                    {link.source}{link.medium ? ` · ${link.medium}` : ''}
                  </span>
                  {link.content && <span className="utm-variant">{link.content}</span>}
                  <div className="utm-link-actions">
                    <button className="utm-icon-btn" onClick={() => handleArchive(link)} title={link.archived ? 'Unarchive' : 'Archive'}>
                      {link.archived ? '↩' : '📥'}
                    </button>
                    <button className="utm-icon-btn utm-icon-danger" onClick={() => handleDelete(link)} title="Delete">
                      <IconTrash />
                    </button>
                  </div>
                </div>

                {link.label && <div className="utm-link-label">{link.label}</div>}

                <div className="utm-url-row">
                  <span className="utm-url-tag utm-url-tag-short">short</span>
                  <code className="utm-url">{link.short_url}</code>
                  <CopyButton value={link.short_url} />
                </div>

                <div className="utm-url-row">
                  <span className="utm-url-tag">full</span>
                  <code className="utm-url utm-url-muted">{link.tagged_url}</code>
                  <CopyButton value={link.tagged_url} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Metrics tab ──────────────────────────────────────────────────────────────

function LeadMetrics() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
  const [campaign, setCampaign] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await fetchUtmStats({ days, campaign }))
      setError('')
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [days, campaign])

  useEffect(() => { load() }, [load])

  const maxLeads = Math.max(1, ...(stats?.bySource || []).map((r) => r.leads))
  const totalLeads = stats?.totals?.leads || 0

  return (
    <div className="utm-metrics">
      <div className="utm-filters">
        <select className="utm-select" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
          <option value="">All campaigns</option>
          {(stats?.campaigns || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="utm-range">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={`utm-range-btn ${days === d ? 'utm-range-active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <button className="btn btn-ghost utm-refresh" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="utm-error">{error}</div>}

      <div className="utm-totals">
        <div className="utm-stat">
          <div className="utm-stat-value">{stats?.totals?.leads ?? '—'}</div>
          <div className="utm-stat-label">Leads</div>
        </div>
        <div className="utm-stat">
          <div className="utm-stat-value">{stats?.totals?.visits ?? '—'}</div>
          <div className="utm-stat-label">Page visits</div>
        </div>
        <div className="utm-stat">
          <div className="utm-stat-value">
            {stats?.totals?.visits ? `${Math.round((stats.totals.leads / stats.totals.visits) * 1000) / 10}%` : '—'}
          </div>
          <div className="utm-stat-label">Visit → lead</div>
        </div>
      </div>

      <div className="utm-panel-title utm-section-title">Where leads came from</div>

      {!loading && (stats?.bySource || []).length === 0 && (
        <div className="utm-note">
          Nothing recorded yet. Once the snippet is on your pages and someone clicks a
          tagged link, sources show up here.
        </div>
      )}

      <div className="utm-source-list">
        {(stats?.bySource || []).map((row) => (
          <div key={`${row.source}-${row.medium || ''}`} className="utm-source-row">
            <div className="utm-source-name">
              <span
                className="utm-preset-dot"
                style={{ '--utm-dot': SOURCE_COLORS[row.source] || 'var(--text-tertiary)' }}
              />
              <span className="utm-source-title">{row.source}</span>
              {row.medium && <span className="utm-source-medium">{row.medium}</span>}
            </div>

            <div className="utm-bar-track">
              <div
                className="utm-bar-fill"
                style={{
                  width: `${(row.leads / maxLeads) * 100}%`,
                  background: SOURCE_COLORS[row.source] || 'var(--text-tertiary)',
                }}
              />
            </div>

            <div className="utm-source-nums">
              <span className="utm-source-leads">{row.leads}</span>
              <span className="utm-source-share">
                {totalLeads > 0 ? `${Math.round((row.leads / totalLeads) * 100)}%` : '—'}
              </span>
              <span className="utm-source-visits">
                {row.visits} visits{row.conversion_rate !== null ? ` · ${row.conversion_rate}%` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      {(stats?.recentLeads || []).length > 0 && (
        <>
          <div className="utm-panel-title utm-section-title">Recent leads</div>
          <div className="utm-recent">
            {stats.recentLeads.map((lead, i) => (
              <div key={i} className="utm-recent-row">
                <span
                  className="utm-preset-dot"
                  style={{ '--utm-dot': SOURCE_COLORS[lead.source] || 'var(--text-tertiary)' }}
                />
                <span className="utm-recent-source">{lead.source}</span>
                <span className="utm-recent-campaign">{lead.campaign || '—'}</span>
                <span className="utm-recent-email">{lead.email || 'no email captured'}</span>
                <span className="utm-recent-time">{timeAgo(lead.occurred_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Setup tab ────────────────────────────────────────────────────────────────

function Setup({ embedBase }) {
  const base = embedBase || 'https://your-dashboard-host'
  const visitSnippet = `<script src="${base}/widgets/utm.js" async></script>`
  const leadSnippet = `<script src="${base}/widgets/utm.js" data-event="lead" async></script>`

  return (
    <div className="utm-setup">
      <div className="utm-panel">
        <div className="utm-panel-title">Two snippets, once per funnel</div>
        <p className="utm-hint">
          Paste these into the page's custom-code / footer box. Same two snippets work on
          Kajabi and Go High Level, on any of your domains — the script figures out where
          to report back on its own.
        </p>

        <div className="utm-step">
          <div className="utm-step-num">1</div>
          <div className="utm-step-body">
            <div className="utm-step-title">Registration / landing page</div>
            <p className="utm-hint">Records the visit and remembers which platform sent them.</p>
            <div className="utm-url-row">
              <code className="utm-url utm-url-code">{visitSnippet}</code>
              <CopyButton value={visitSnippet} />
            </div>
          </div>
        </div>

        <div className="utm-step">
          <div className="utm-step-num">2</div>
          <div className="utm-step-body">
            <div className="utm-step-title">Thank-you / confirmation page</div>
            <p className="utm-hint">
              This is the one that counts a lead. Note the <code>data-event="lead"</code> —
              without it the page is only counted as a visit.
            </p>
            <div className="utm-url-row">
              <code className="utm-url utm-url-code">{leadSnippet}</code>
              <CopyButton value={leadSnippet} />
            </div>
          </div>
        </div>
      </div>

      <div className="utm-panel">
        <div className="utm-panel-title">Worth knowing</div>
        <ul className="utm-facts">
          <li>
            <b>Leads are deduplicated</b> per person per campaign, so refreshing the
            thank-you page won't inflate your numbers.
          </li>
          <li>
            <b>Untagged traffic still counts.</b> Someone who types the URL directly shows
            up as <code>direct</code> rather than vanishing, so the total matches your real
            registration count.
          </li>
          <li>
            <b>Paid funnels work the same way.</b> For the 5-day challenge, put the lead
            snippet on the post-purchase thank-you page and give it its own campaign name.
          </li>
          <li>
            <b>If your funnel spans two domains</b>, attribution still follows the visitor —
            the script carries an anonymous id across, and falls back to matching on
            device within a 6-hour window.
          </li>
          <li>
            <b>Expect slightly lower numbers than Meta reports.</b> Meta counts
            view-through conversions; this counts people who actually clicked through.
          </li>
        </ul>
      </div>
    </div>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'metrics', label: 'Lead Sources', icon: IconChart },
  { id: 'links', label: 'Links', icon: IconLink },
  { id: 'setup', label: 'Setup', icon: IconCode },
]

export default function UtmTracker() {
  const [tab, setTab] = useState('metrics')
  const [embedBase, setEmbedBase] = useState(null)

  // The Setup tab needs the public host, which only the links endpoint reports.
  // Fetch it once up front so Setup renders real snippets even if the user never
  // opens the Links tab.
  useEffect(() => {
    fetchUtmLinks().then((d) => setEmbedBase(d.embedBase)).catch(() => {})
  }, [])

  return (
    <div className="utm-tracker">
      <div className="page-header">
        <div className="page-header-icon"><IconLink /></div>
        <div>
          <div className="page-header-title">Lead Tracking</div>
          <div className="page-header-subtitle">See which platform each lead came from</div>
        </div>
      </div>

      <div className="utm-tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`utm-tab ${tab === t.id ? 'utm-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="utm-tab-icon"><Icon /></span>
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="utm-scroll">
        {tab === 'metrics' && <LeadMetrics />}
        {tab === 'links' && <LinkBuilder embedBase={embedBase} onEmbedBase={setEmbedBase} />}
        {tab === 'setup' && <Setup embedBase={embedBase} />}
      </div>
    </div>
  )
}
