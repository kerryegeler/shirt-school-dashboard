import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchContentIdeas, updateContentIdea, deleteContentIdea,
  fetchContentBriefs, fetchContentBrief, runContentBrief,
  fetchContentTopics, createContentTopic, updateContentTopic, deleteContentTopic,
  fetchChannelStats, fetchYouTubeChannels, lookupChannel, selectChannel, refreshChannelStats,
  fetchCompetitors, addCompetitor, updateCompetitor, deleteCompetitor,
} from '../../services/api.js'
import './ContentAgent.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconLightbulb = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1a4 4 0 0 1 2.5 7.1V10H5.5V8.1A4 4 0 0 1 8 1z" />
    <path d="M5.5 10h5M6 12h4M7 14h2" />
  </svg>
)

const IconFilm = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1" />
    <path d="M5 3v10M11 3v10M1 8h14M1 5.5h4M1 10.5h4M11 5.5h4M11 10.5h4" />
  </svg>
)

const IconYouTube = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="2" />
    <path d="M6.5 6l4 2.5-4 2.5V6z" fill="currentColor" stroke="none" />
  </svg>
)

const IconSettings = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
  </svg>
)

const IconCalendar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="11" rx="1.5" />
    <path d="M1 7h14M5 1v4M11 1v4" />
  </svg>
)

const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 1 1 1.5 4" />
    <path d="M2 12V8h4" />
  </svg>
)

const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12M6 4V2h4v2M5 4l.5 9h5L11 4" />
  </svg>
)

const IconPlay = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor" stroke="none" />
  </svg>
)

const IconStar = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" stroke="none">
    <path d="M8 1.5l1.75 3.55 3.92.57-2.84 2.76.67 3.9L8 10.35l-3.5 1.93.67-3.9-2.84-2.76 3.92-.57L8 1.5z" />
  </svg>
)

const IconBrief = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="1" width="12" height="14" rx="1.5" />
    <path d="M5 5h6M5 8h6M5 11h3" />
  </svg>
)

// ─── Ideas Bank tab ───────────────────────────────────────────────────────────

function IdeasBank({ onSchedule }) {
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'short' | 'long' | 'filmed'
  const [editingNote, setEditingNote] = useState(null) // idea id
  const [noteValue, setNoteValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchContentIdeas()
      setIdeas(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(id, status) {
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status } : i))
    await updateContentIdea(id, { status })
  }

  async function handleDelete(id) {
    setIdeas((prev) => prev.filter((i) => i.id !== id))
    await deleteContentIdea(id)
  }

  async function handleSaveNote(id) {
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, notes: noteValue } : i))
    await updateContentIdea(id, { notes: noteValue })
    setEditingNote(null)
  }

  const filtered = ideas.filter((i) => {
    if (filter === 'filmed') return i.status === 'filmed'
    if (filter === 'short') return i.format === 'short' && i.status !== 'filmed'
    if (filter === 'long') return i.format === 'long' && i.status !== 'filmed'
    return i.status !== 'filmed'
  })

  return (
    <div className="ca-panel">
      <div className="ca-panel-toolbar">
        <select className="ca-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All ideas</option>
          <option value="short">Short form</option>
          <option value="long">Long form</option>
          <option value="filmed">Filmed</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <IconRefresh /> Refresh
        </button>
      </div>

      {loading && <div className="ca-loading"><div className="ca-spinner" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="ca-empty">
          {ideas.length === 0
            ? 'No saved ideas yet. Click ⭐ Save in Slack when a daily brief drops, or run a brief now from the Past Briefs tab.'
            : 'No ideas in this category.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="ca-ideas-list">
          {filtered.map((idea) => (
            <div key={idea.id} className={`ca-idea-card ${idea.status === 'filmed' ? 'idea-filmed' : ''}`}>
              <div className="ca-idea-header">
                <span className={`ca-format-badge ca-format-${idea.format}`}>
                  {idea.format === 'short' ? '📱 Short' : '🎬 Long'}
                </span>
                <span className="ca-idea-date">{formatDate(idea.created_at)}</span>
                <div className="ca-idea-actions">
                  {idea.status !== 'filmed' && (
                    <button
                      className="btn btn-ghost btn-xs ca-filmed-btn"
                      onClick={() => handleStatusChange(idea.id, 'filmed')}
                      title="Mark as filmed"
                    >
                      <IconPlay /> Filmed
                    </button>
                  )}
                  {idea.status === 'filmed' && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleStatusChange(idea.id, 'saved')}
                      title="Mark as not filmed"
                    >
                      Undo
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-xs ca-schedule-btn"
                    onClick={() => onSchedule(idea)}
                    title="Add to calendar"
                  >
                    <IconCalendar />
                  </button>
                  <button
                    className="btn btn-ghost btn-xs ca-delete-btn"
                    onClick={() => handleDelete(idea.id)}
                    title="Delete"
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>

              <div className="ca-idea-title">{idea.title}</div>

              {idea.source && (
                <div className="ca-idea-source">
                  <span className="ca-source-badge ca-source-badge--{idea.source}">
                    {idea.source === 'A' ? '📊 My Channel' : idea.source === 'B' ? '🎯 Competitor' : '📰 Trending'}
                  </span>
                  {idea.source_note && <span className="ca-source-note"> — {idea.source_note}</span>}
                </div>
              )}

              {idea.hook && (
                <div className="ca-idea-detail">
                  <span className="ca-detail-label">Hook:</span> {idea.hook}
                </div>
              )}
              {idea.outline && (
                <div className="ca-idea-detail">
                  <span className="ca-detail-label">Outline:</span> {idea.outline}
                </div>
              )}
              {idea.why_timely && (
                <div className="ca-idea-timely">{idea.why_timely}</div>
              )}
              {idea.calendar_date && (
                <div className="ca-idea-calendar-date">
                  <IconCalendar /> Scheduled: {formatDate(idea.calendar_date)}
                </div>
              )}

              {editingNote === idea.id ? (
                <div className="ca-note-edit">
                  <textarea
                    className="ca-note-textarea"
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Add notes…"
                  />
                  <div className="ca-note-actions">
                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveNote(idea.id)}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingNote(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  className="ca-note-view"
                  onClick={() => { setEditingNote(idea.id); setNoteValue(idea.notes || '') }}
                >
                  {idea.notes
                    ? <span className="ca-note-text">{idea.notes}</span>
                    : <span className="ca-note-placeholder">+ Add note</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Past Briefs tab ──────────────────────────────────────────────────────────

function PastBriefs() {
  const [briefs, setBriefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningBrief, setRunningBrief] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [briefDetail, setBriefDetail] = useState({})
  const [briefMessage, setBriefMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchContentBriefs()
      setBriefs(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRunBrief() {
    setRunningBrief(true)
    setBriefMessage('')
    try {
      await runContentBrief()
      setBriefMessage('Brief is running in the background. Refresh in ~60 seconds to see it.')
      setTimeout(() => load(), 60_000)
    } catch (err) {
      setBriefMessage(`Error: ${err.message}`)
    }
    setRunningBrief(false)
  }

  async function handleExpand(briefId) {
    if (expanded === briefId) { setExpanded(null); return }
    setExpanded(briefId)
    if (!briefDetail[briefId]) {
      try {
        const b = await fetchContentBrief(briefId)
        setBriefDetail((prev) => ({ ...prev, [briefId]: b }))
      } catch {}
    }
  }

  return (
    <div className="ca-panel">
      <div className="ca-panel-toolbar">
        <button
          className="btn btn-primary"
          onClick={handleRunBrief}
          disabled={runningBrief}
        >
          {runningBrief ? 'Running…' : '▶ Run Brief Now'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <IconRefresh /> Refresh
        </button>
        {briefMessage && <span className="ca-brief-msg">{briefMessage}</span>}
      </div>

      {loading && <div className="ca-loading"><div className="ca-spinner" /></div>}

      {!loading && briefs.length === 0 && (
        <div className="ca-empty">No briefs yet. Click "Run Brief Now" to generate your first one.</div>
      )}

      {!loading && briefs.length > 0 && (
        <div className="ca-briefs-list">
          {briefs.map((brief) => (
            <div key={brief.id} className="ca-brief-row">
              <button className="ca-brief-toggle" onClick={() => handleExpand(brief.id)}>
                <span className="ca-brief-date">{formatDate(brief.run_at)}</span>
                <span className="ca-brief-meta">
                  {brief.youtube?.length || 0} videos · {brief.news?.length || 0} articles · {' '}
                  {(brief.ideas?.short_form?.length || 0) + (brief.ideas?.long_form?.length || 0)} ideas
                </span>
                <span className="ca-brief-chevron">{expanded === brief.id ? '▲' : '▼'}</span>
              </button>

              {expanded === brief.id && briefDetail[brief.id] && (
                <BriefDetail brief={briefDetail[brief.id]} />
              )}
              {expanded === brief.id && !briefDetail[brief.id] && (
                <div className="ca-loading ca-loading-sm"><div className="ca-spinner" /></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BriefDetail({ brief }) {
  return (
    <div className="ca-brief-detail">
      {brief.competitors?.length > 0 && (
        <div className="ca-brief-section">
          <div className="ca-brief-section-title">🎯 Competitor Activity</div>
          {brief.competitors.map((ch, i) => {
            // New format: {channel, newVideos, noNew}
            if (ch.newVideos !== undefined) {
              if (ch.noNew || !ch.newVideos?.length) {
                return (
                  <div key={i} className="ca-brief-item">
                    <span className="ca-brief-item-meta">{ch.channel} — no new videos</span>
                  </div>
                )
              }
              return ch.newVideos.map((v, j) => (
                <div key={`${i}-${j}`} className="ca-brief-item">
                  <a href={v.url} target="_blank" rel="noreferrer" className="ca-link">
                    {v.isBreakout && '🔥 '}{v.title}
                  </a>
                  <span className="ca-brief-item-meta">
                    {v.channel} · {formatNum(v.views)} views
                    {v.isBreakout && ` · ${Math.round(v.views / v.channelAvgViews)}x avg`}
                  </span>
                </div>
              ))
            }
            // Legacy flat format
            return (
              <div key={i} className="ca-brief-item">
                <a href={ch.url} target="_blank" rel="noreferrer" className="ca-link">
                  {ch.isBreakout && '🔥 '}{ch.title}
                </a>
                <span className="ca-brief-item-meta">
                  {ch.channel} · {formatNum(ch.views)} views
                  {ch.isBreakout && ` · ${Math.round(ch.views / ch.channelAvgViews)}x avg`}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {brief.news?.length > 0 && (
        <div className="ca-brief-section">
          <div className="ca-brief-section-title">📰 Industry News</div>
          {brief.news.map((n, i) => (
            <div key={i} className="ca-brief-item">
              <a href={n.url} target="_blank" rel="noreferrer" className="ca-link">{n.title}</a>
              <span className="ca-brief-item-meta">{n.source}{n.date ? ` · ${n.date}` : ''}</span>
              {n.snippet && <div className="ca-brief-snippet">{n.snippet}</div>}
            </div>
          ))}
        </div>
      )}
      {brief.reddit?.length > 0 && (
        <div className="ca-brief-section">
          <div className="ca-brief-section-title">💬 Reddit Buzz</div>
          {brief.reddit.map((r, i) => (
            <div key={i} className="ca-brief-item">
              <a href={r.url} target="_blank" rel="noreferrer" className="ca-link">{r.title}</a>
              <span className="ca-brief-item-meta">{r.subreddit}</span>
            </div>
          ))}
        </div>
      )}
      {brief.tools?.length > 0 && (
        <div className="ca-brief-section">
          <div className="ca-brief-section-title">🛠️ Tool Updates</div>
          {brief.tools.map((t, i) => (
            <div key={i} className="ca-brief-item">
              <a href={t.url} target="_blank" rel="noreferrer" className="ca-link">{t.title}</a>
              {t.snippet && <div className="ca-brief-snippet">{t.snippet}</div>}
            </div>
          ))}
        </div>
      )}
      {(brief.ideas?.short_form?.length > 0 || brief.ideas?.long_form?.length > 0) && (
        <div className="ca-brief-section">
          <div className="ca-brief-section-title">💡 Content Ideas</div>
          {brief.ideas.short_form?.map((idea, i) => (
            <div key={i} className="ca-brief-idea">
              <span className="ca-format-badge ca-format-short">📱 Short</span>
              <strong>{idea.title}</strong>
              {idea.source && <span className="ca-source-mini">{idea.source === 'A' ? '📊 My Channel' : idea.source === 'B' ? '🎯 Competitor' : '📰 Trending'}</span>}
              {idea.hook && <div className="ca-brief-snippet">Hook: {idea.hook}</div>}
              {idea.why_timely && <div className="ca-brief-snippet ca-timely-text">{idea.why_timely}</div>}
            </div>
          ))}
          {brief.ideas.long_form?.map((idea, i) => (
            <div key={i} className="ca-brief-idea">
              <span className="ca-format-badge ca-format-long">🎬 Long</span>
              <strong>{idea.title}</strong>
              {idea.source && <span className="ca-source-mini">{idea.source === 'A' ? '📊 My Channel' : idea.source === 'B' ? '🎯 Competitor' : '📰 Trending'}</span>}
              {idea.outline && <div className="ca-brief-snippet">{idea.outline}</div>}
              {idea.why_timely && <div className="ca-brief-snippet ca-timely-text">{idea.why_timely}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Channel Stats tab ────────────────────────────────────────────────────────

function ChannelStats() {
  const [state, setState] = useState({ stats: null, configured: false, channelId: null, kerryConnected: false })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  // Channel selector state
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResults, setLookupResults] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchChannelStats()
      setState(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleLookup(e) {
    e.preventDefault()
    if (!lookupQuery.trim()) return
    setLookupLoading(true)
    setLookupError('')
    setLookupResults(null)
    try {
      const channels = await lookupChannel(lookupQuery.trim())
      setLookupResults(channels)
    } catch (err) {
      setLookupError(err.message)
    }
    setLookupLoading(false)
  }

  async function handleSelectChannel(channelId) {
    setSaving(true)
    try {
      await selectChannel(channelId)
      setLookupResults(null)
      setLookupQuery('')
      // Kick off stats refresh right away
      await refreshChannelStats()
      setRefreshMsg('Fetching stats… refresh in ~10 seconds.')
      setTimeout(() => load(), 10_000)
    } catch (err) {
      setLookupError(err.message)
    }
    setSaving(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    setRefreshMsg('')
    try {
      await refreshChannelStats()
      setRefreshMsg('Fetching stats… refresh in ~10 seconds.')
      setTimeout(() => load(), 10_000)
    } catch (err) {
      setRefreshMsg(`Error: ${err.message}`)
    }
    setRefreshing(false)
  }

  if (loading) return <div className="ca-panel"><div className="ca-loading"><div className="ca-spinner" /></div></div>

  const { stats, configured, channelId, kerryConnected } = state

  // Channel selector (shown when not configured OR user wants to change)
  const ChannelSelector = () => (
    <div className="ca-channel-setup">
      <div className="ca-channel-setup-title">Connect your YouTube channel</div>
      <p className="ca-channel-setup-desc">
        Enter your channel handle (e.g. <code>@shirtschool</code>) or channel ID (starts with <code>UC…</code> — find it in YouTube Studio → Settings → Channel → Basic info).
      </p>
      <form className="ca-channel-lookup-form" onSubmit={handleLookup}>
        <input
          className="ca-topic-input"
          value={lookupQuery}
          onChange={(e) => setLookupQuery(e.target.value)}
          placeholder="@shirtschool or UCxxxxxxx…"
        />
        <button className="btn btn-primary" type="submit" disabled={lookupLoading || !lookupQuery.trim()}>
          {lookupLoading ? 'Searching…' : 'Find Channel'}
        </button>
      </form>
      {lookupError && <div className="ca-lookup-error">{lookupError}</div>}
      {lookupResults && (
        <div className="ca-lookup-results">
          {lookupResults.length === 0 && <div className="ca-lookup-error">No channels found.</div>}
          {lookupResults.map((ch) => (
            <div key={ch.id} className="ca-lookup-channel">
              {ch.thumbnail && <img src={ch.thumbnail} alt="" className="ca-ch-thumb" />}
              <div className="ca-ch-info">
                <div className="ca-ch-name">{ch.name}</div>
                <div className="ca-ch-id">{ch.id} · {formatNum(ch.subscribers)} subscribers</div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleSelectChannel(ch.id)}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Use This Channel'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (!kerryConnected) {
    return (
      <div className="ca-panel">
        <div className="ca-empty">
          <p>kerry@shirtschool.com is not connected.</p>
          <p style={{ marginTop: 8, fontSize: 13 }}>Click "Reconnect" next to kerry@shirtschool.com in the sidebar to grant YouTube access.</p>
        </div>
      </div>
    )
  }

  if (!configured || !stats) {
    return (
      <div className="ca-panel ca-channel-panel">
        <ChannelSelector />
        {refreshMsg && <div className="ca-brief-msg" style={{ marginTop: 12 }}>{refreshMsg}</div>}
      </div>
    )
  }

  const avgViews = stats.avg_views || 0
  const topVideos = stats.top_videos || []
  const recentVideos = stats.recent_videos || []

  return (
    <div className="ca-panel ca-channel-panel">
      <div className="ca-panel-toolbar">
        <span className="ca-channel-name-label">{stats.channel_name}</span>
        <button className="btn btn-ghost btn-sm" onClick={handleRefresh} disabled={refreshing}>
          <IconRefresh /> {refreshing ? 'Refreshing…' : 'Refresh Stats'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setState((s) => ({ ...s, configured: false }))}>
          Change Channel
        </button>
        {refreshMsg && <span className="ca-brief-msg">{refreshMsg}</span>}
      </div>

      <div className="ca-channel-stats-row">
        <div className="ca-stat-card">
          <div className="ca-stat-value">{formatNum(stats.subscriber_count)}</div>
          <div className="ca-stat-label">Subscribers</div>
        </div>
        <div className="ca-stat-card">
          <div className="ca-stat-value">{formatNum(stats.view_count)}</div>
          <div className="ca-stat-label">Total Views</div>
        </div>
        <div className="ca-stat-card">
          <div className="ca-stat-value">{stats.video_count?.toLocaleString()}</div>
          <div className="ca-stat-label">Videos</div>
        </div>
        <div className="ca-stat-card">
          <div className="ca-stat-value">{formatNum(avgViews)}</div>
          <div className="ca-stat-label">Avg Views / Video</div>
        </div>
      </div>

      <div className="ca-channel-grid">
        <div className="ca-channel-col">
          <div className="ca-section-heading">🏆 Top 10 All-Time</div>
          {topVideos.map((v, i) => (
            <div key={v.id} className="ca-video-row">
              <span className="ca-video-rank">{i + 1}</span>
              <div className="ca-video-info">
                <a href={v.url} target="_blank" rel="noreferrer" className="ca-link ca-video-title">{v.title}</a>
                <div className="ca-video-stats">
                  {formatNum(v.views)} views
                  {v.views > avgViews * 1.5 && <span className="ca-outperform-badge">⬆ Outperformed</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="ca-channel-col">
          <div className="ca-section-heading">🕒 Last 10 Uploaded</div>
          {recentVideos.map((v) => (
            <div key={v.id} className="ca-video-row">
              <span className="ca-video-date">{formatDateShort(v.publishedAt)}</span>
              <div className="ca-video-info">
                <a href={v.url} target="_blank" rel="noreferrer" className="ca-link ca-video-title">{v.title}</a>
                <div className="ca-video-stats">
                  {formatNum(v.views)} views · {formatNum(v.likes)} likes · {v.comments} comments
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ca-channel-footer">
        Data last updated: {formatDate(stats.fetched_at)}
      </div>
    </div>
  )
}

// ─── Topics Settings tab ──────────────────────────────────────────────────────

function CompetitorChannels() {
  const [competitors, setCompetitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupError, setLookupError] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCompetitors(await fetchCompetitors()) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleLookup(e) {
    e.preventDefault()
    if (!lookupQuery.trim()) return
    setLookingUp(true)
    setLookupResult(null)
    setLookupError('')
    try {
      const channels = await lookupChannel(lookupQuery.trim())
      setLookupResult(channels[0] || null)
      if (!channels.length) setLookupError('Channel not found')
    } catch (err) {
      setLookupError(err.message)
    }
    setLookingUp(false)
  }

  async function handleAdd() {
    if (!lookupResult) return
    setAdding(true)
    try {
      const competitor = await addCompetitor({
        channelId: lookupResult.id,
        channelName: lookupResult.name,
        thumbnail: lookupResult.thumbnail,
      })
      setCompetitors((prev) => [...prev, competitor])
      setLookupResult(null)
      setLookupQuery('')
    } catch (err) {
      setLookupError(err.message)
    }
    setAdding(false)
  }

  async function handleToggle(c) {
    setCompetitors((prev) => prev.map((x) => x.id === c.id ? { ...x, active: !x.active } : x))
    await updateCompetitor(c.id, { active: !c.active })
  }

  async function handleDelete(id) {
    setCompetitors((prev) => prev.filter((x) => x.id !== id))
    await deleteCompetitor(id)
  }

  const alreadyAdded = new Set(competitors.map((c) => c.channel_id))

  return (
    <div className="ca-competitor-section">
      <div className="ca-section-label">Competitor Channels</div>
      <div className="ca-topics-intro" style={{ marginBottom: 12 }}>
        Track specific YouTube channels. Each morning their last 5 videos are fetched and videos with 2x+ their average views are flagged as breakouts.
      </div>

      {loading ? (
        <div className="ca-loading"><div className="ca-spinner" /></div>
      ) : (
        <div className="ca-topics-list">
          {competitors.length === 0 && (
            <div className="ca-empty-state" style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-muted)' }}>No competitor channels added yet.</div>
          )}
          {competitors.map((c) => (
            <div key={c.id} className={`ca-topic-row ${!c.active ? 'topic-inactive' : ''}`}>
              <button
                className={`ca-topic-toggle ${c.active ? 'toggle-on' : 'toggle-off'}`}
                onClick={() => handleToggle(c)}
                title={c.active ? 'Disable' : 'Enable'}
              />
              {c.thumbnail && <img src={c.thumbnail} alt="" className="ca-ch-thumb" style={{ width: 22, height: 22, borderRadius: '50%', marginRight: 6 }} />}
              <span className="ca-topic-keyword">{c.channel_name}</span>
              <span className="ca-ch-id">{c.channel_id}</span>
              <div className="ca-topic-actions">
                <button className="btn btn-ghost btn-xs ca-delete-btn" onClick={() => handleDelete(c.id)} title="Remove">
                  <IconTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="ca-lookup-channel" onSubmit={handleLookup} style={{ marginTop: 12 }}>
        <input
          className="ca-topic-input"
          value={lookupQuery}
          onChange={(e) => setLookupQuery(e.target.value)}
          placeholder="Add channel: @handle or UC… channel ID"
        />
        <button className="btn btn-ghost" type="submit" disabled={lookingUp || !lookupQuery.trim()}>
          {lookingUp ? 'Looking up…' : 'Find'}
        </button>
      </form>

      {lookupError && <div className="ca-error" style={{ marginTop: 6, fontSize: 12 }}>{lookupError}</div>}

      {lookupResult && !alreadyAdded.has(lookupResult.id) && (
        <div className="ca-channel-result" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
          {lookupResult.thumbnail && <img src={lookupResult.thumbnail} alt="" className="ca-ch-thumb" style={{ width: 32, height: 32, borderRadius: '50%' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{lookupResult.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lookupResult.id} • {formatNum(lookupResult.subscribers)} subscribers</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </div>
      )}
      {lookupResult && alreadyAdded.has(lookupResult.id) && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>Already tracking {lookupResult.name}.</div>
      )}
    </div>
  )
}

function TopicsSettings() {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [newKeyword, setNewKeyword] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchContentTopics()
      setTopics(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    if (!newKeyword.trim()) return
    setAdding(true)
    try {
      const topic = await createContentTopic(newKeyword.trim())
      setTopics((prev) => [...prev, topic])
      setNewKeyword('')
    } catch {}
    setAdding(false)
  }

  async function handleToggle(topic) {
    const updated = { ...topic, active: !topic.active }
    setTopics((prev) => prev.map((t) => t.id === topic.id ? updated : t))
    await updateContentTopic(topic.id, { active: !topic.active })
  }

  async function handleEdit(id) {
    await updateContentTopic(id, { keyword: editValue.trim() })
    setTopics((prev) => prev.map((t) => t.id === id ? { ...t, keyword: editValue.trim() } : t))
    setEditingId(null)
  }

  async function handleDelete(id) {
    setTopics((prev) => prev.filter((t) => t.id !== id))
    await deleteContentTopic(id)
  }

  return (
    <div className="ca-panel">
      <div className="ca-topics-intro">
        These keywords are used for news research in every daily brief. Active topics are included in each run.
      </div>

      {loading ? (
        <div className="ca-loading"><div className="ca-spinner" /></div>
      ) : (
        <div className="ca-topics-list">
          {topics.map((topic) => (
            <div key={topic.id} className={`ca-topic-row ${!topic.active ? 'topic-inactive' : ''}`}>
              <button
                className={`ca-topic-toggle ${topic.active ? 'toggle-on' : 'toggle-off'}`}
                onClick={() => handleToggle(topic)}
                title={topic.active ? 'Disable' : 'Enable'}
              />
              {editingId === topic.id ? (
                <input
                  className="ca-topic-edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(topic.id); if (e.key === 'Escape') setEditingId(null) }}
                  autoFocus
                />
              ) : (
                <span
                  className="ca-topic-keyword"
                  onDoubleClick={() => { setEditingId(topic.id); setEditValue(topic.keyword) }}
                  title="Double-click to edit"
                >
                  {topic.keyword}
                </span>
              )}
              <div className="ca-topic-actions">
                {editingId === topic.id ? (
                  <>
                    <button className="btn btn-primary btn-xs" onClick={() => handleEdit(topic.id)}>Save</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-xs ca-delete-btn" onClick={() => handleDelete(topic.id)} title="Delete">
                    <IconTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form className="ca-add-topic" onSubmit={handleAdd}>
        <input
          className="ca-topic-input"
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Add a research topic…"
        />
        <button className="btn btn-primary" type="submit" disabled={adding || !newKeyword.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 24 }}>
        <CompetitorChannels />
      </div>
    </div>
  )
}

// ─── Content Calendar tab ─────────────────────────────────────────────────────

function ContentCalendar() {
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [dragId, setDragId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchContentIdeas()
      setIdeas(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Build week days starting from this Monday + offset
  function getWeekDays() {
    const now = new Date()
    const day = now.getDay() // 0=Sun
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7)
    monday.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
  }

  const days = getWeekDays()
  const scheduledIds = new Set(ideas.filter((i) => i.calendar_date).map((i) => i.id))
  const unscheduled = ideas.filter((i) => !i.calendar_date && i.status !== 'filmed')

  function ideasForDay(day) {
    const iso = day.toISOString().slice(0, 10)
    return ideas.filter((i) => i.calendar_date === iso)
  }

  async function handleDrop(day) {
    if (!dragId) return
    const iso = day.toISOString().slice(0, 10)
    setIdeas((prev) => prev.map((i) => i.id === dragId ? { ...i, calendar_date: iso } : i))
    await updateContentIdea(dragId, { calendar_date: iso })
    setDragId(null)
  }

  async function handleRemoveFromDay(id) {
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, calendar_date: null } : i))
    await updateContentIdea(id, { calendar_date: '' })
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="ca-panel ca-calendar-panel">
      <div className="ca-cal-header">
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w - 1)}>← Prev</button>
        <span className="ca-cal-range">
          {days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
          {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Today</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset((w) => w + 1)}>Next →</button>
      </div>

      {loading ? (
        <div className="ca-loading"><div className="ca-spinner" /></div>
      ) : (
        <>
          <div className="ca-cal-grid">
            {days.map((day, i) => {
              const iso = day.toISOString().slice(0, 10)
              const dayIdeas = ideasForDay(day)
              const isToday = iso === today
              return (
                <div
                  key={i}
                  className={`ca-cal-day ${isToday ? 'cal-today' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(day)}
                >
                  <div className="ca-cal-day-label">
                    <span className="ca-cal-day-name">{DAY_NAMES[i]}</span>
                    <span className={`ca-cal-day-num ${isToday ? 'today-num' : ''}`}>
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="ca-cal-day-ideas">
                    {dayIdeas.map((idea) => (
                      <div
                        key={idea.id}
                        className={`ca-cal-idea ca-cal-idea-${idea.format}`}
                        draggable
                        onDragStart={() => setDragId(idea.id)}
                        title={idea.title}
                      >
                        <span className="ca-cal-idea-title">{idea.title}</span>
                        <button
                          className="ca-cal-remove"
                          onClick={() => handleRemoveFromDay(idea.id)}
                          title="Remove from day"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {unscheduled.length > 0 && (
            <div className="ca-cal-unscheduled">
              <div className="ca-section-heading">Drag ideas onto a day to schedule them</div>
              <div className="ca-cal-pool">
                {unscheduled.map((idea) => (
                  <div
                    key={idea.id}
                    className={`ca-pool-idea ca-cal-idea-${idea.format}`}
                    draggable
                    onDragStart={() => setDragId(idea.id)}
                    title={idea.title}
                  >
                    <span className={`ca-format-badge ca-format-${idea.format}`}>
                      {idea.format === 'short' ? '📱' : '🎬'}
                    </span>
                    {idea.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main ContentAgent component ──────────────────────────────────────────────

const TABS = [
  { id: 'ideas',    label: 'Ideas Bank',   icon: IconStar },
  { id: 'briefs',   label: 'Past Briefs',  icon: IconBrief },
  { id: 'channel',  label: 'My Channel',   icon: IconYouTube },
  { id: 'topics',   label: 'Topics',       icon: IconSettings },
  { id: 'calendar', label: 'Calendar',     icon: IconCalendar },
]

export default function ContentAgent() {
  const [tab, setTab] = useState('ideas')
  const [schedulingIdea, setSchedulingIdea] = useState(null)

  function handleSchedule(idea) {
    setSchedulingIdea(idea)
    setTab('calendar')
  }

  return (
    <div className="content-agent">
      <div className="page-header">
        <div className="page-header-icon">
          <IconLightbulb />
        </div>
        <div>
          <div className="page-header-title">Content Agent</div>
          <div className="page-header-subtitle">Daily industry intelligence + content idea generator</div>
        </div>
      </div>

      <div className="ca-tab-bar">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`ca-tab ${tab === t.id ? 'ca-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="ca-tab-icon"><Icon /></span>
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="ca-body">
        {tab === 'ideas'    && <IdeasBank onSchedule={handleSchedule} />}
        {tab === 'briefs'   && <PastBriefs />}
        {tab === 'channel'  && <ChannelStats />}
        {tab === 'topics'   && <TopicsSettings />}
        {tab === 'calendar' && <ContentCalendar schedulingIdea={schedulingIdea} onScheduled={() => setSchedulingIdea(null)} />}
      </div>
    </div>
  )
}
