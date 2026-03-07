import { useState, useEffect, useCallback, useMemo } from 'react'
import EmailList from './EmailList.jsx'
import EmailDetail from './EmailDetail.jsx'
import { markEmailRead, markEmailUnread, reclassifyEmail, archiveEmail, fetchThread } from '../../services/api.js'
import './EmailAgent.css'

const IconEmail = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
  </svg>
)

const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 4A6.5 6.5 0 102 8.5" />
    <path d="M13.5 1v3h-3" />
  </svg>
)

const NAV_STATUS_VIEWS = [
  { id: 'all',            label: 'All' },
  { id: 'needs_reply',    label: 'Needs Reply' },
  { id: 'awaiting_reply', label: 'Awaiting Response' },
  { id: 'archived',       label: 'Archived' },
]

const NAV_CATEGORY_VIEWS = [
  { id: 'student_support', label: 'Support' },
  { id: 'sponsorship',     label: 'Sponsorship' },
  { id: 'general',         label: 'Spam' },
]

export default function EmailAgent({ onUnreadChange, connectedAccounts = [] }) {
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [sidebarView, setSidebarView] = useState('all')
  const [viewMode, setViewMode] = useState('inbox') // 'inbox' | 'archived'
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchEmails = useCallback(async (isRefresh = false, mode = null) => {
    const currentMode = mode ?? viewMode
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const url = currentMode === 'archived' ? '/api/emails?archived=true' : '/api/emails'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load emails')
      setEmails(data.emails)
      if (!isRefresh) setSelectedEmail(data.emails[0] || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [viewMode])

  // Initial load
  useEffect(() => {
    fetchEmails()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 2 minutes (inbox only)
  useEffect(() => {
    if (viewMode !== 'inbox') return
    const interval = setInterval(() => fetchEmails(true), 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchEmails, viewMode])

  const unreadCount = emails.filter((e) => !e.read).length

  useEffect(() => {
    onUnreadChange?.(unreadCount)
  }, [unreadCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── View switching ──────────────────────────────────────────────────────────

  function handleNavClick(viewId) {
    if (viewId === 'archived') {
      if (viewMode !== 'archived') {
        setViewMode('archived')
        setSelectedEmail(null)
        setSelectedIds(new Set())
        setSidebarView('all')
        setEmails([]) // clear inbox data so it doesn't flash into archived views
        fetchEmails(true, 'archived') // isRefresh=true keeps nav visible (no full skeleton)
      }
    } else {
      if (viewMode === 'archived') {
        setViewMode('inbox')
        setSelectedEmail(null)
        setSelectedIds(new Set())
        setEmails([]) // clear archived data so it doesn't appear in status views
        fetchEmails(true, 'inbox') // isRefresh=true keeps nav visible (no full skeleton)
      }
      setSidebarView(viewId)
    }
  }

  // ── Filtered emails + counts ────────────────────────────────────────────────

  const filteredEmails = useMemo(() => {
    if (viewMode === 'archived') return emails
    switch (sidebarView) {
      case 'needs_reply':    return emails.filter((e) => e.status === 'unread' || e.status === 'read')
      case 'awaiting_reply': return emails.filter((e) => e.status === 'awaiting_reply')
      case 'student_support': return emails.filter((e) => e.category === 'student_support')
      case 'sponsorship':    return emails.filter((e) => e.category === 'sponsorship')
      case 'general':        return emails.filter((e) => e.category === 'general')
      default:               return emails
    }
  }, [emails, viewMode, sidebarView])

  const counts = useMemo(() => ({
    all:             emails.length,
    needs_reply:     emails.filter((e) => e.status === 'unread' || e.status === 'read').length,
    awaiting_reply:  emails.filter((e) => e.status === 'awaiting_reply').length,
    student_support: emails.filter((e) => e.category === 'student_support').length,
    sponsorship:     emails.filter((e) => e.category === 'sponsorship').length,
    general:         emails.filter((e) => e.category === 'general').length,
  }), [emails])

  // ── Field helpers ───────────────────────────────────────────────────────────

  function updateEmailFields(id, fields) {
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, ...fields } : e))
    setSelectedEmail((prev) => prev?.id === id ? { ...prev, ...fields } : prev)
  }

  function setEmailRead(id, read) {
    setEmails((prev) => prev.map((e) => {
      if (e.id !== id) return e
      const status = !read ? 'unread' : (e.status === 'unread' ? 'read' : e.status)
      return { ...e, read, status }
    }))
    setSelectedEmail((prev) => {
      if (prev?.id !== id) return prev
      const status = !read ? 'unread' : (prev.status === 'unread' ? 'read' : prev.status)
      return { ...prev, read, status }
    })
  }

  // ── Select email + background thread sync ──────────────────────────────────

  async function handleSelectEmail(email) {
    setSelectedEmail(email)
    if (!email.read) {
      setEmailRead(email.id, true)
      markEmailRead(email.id, email.account).catch(() => setEmailRead(email.id, false))
    }
    // Fetch fresh thread data in background (picks up new replies)
    fetchThread(email.id, email.account)
      .then((fresh) => {
        if (!fresh) return
        setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, ...fresh } : e))
        setSelectedEmail((prev) => prev?.id === email.id ? { ...prev, ...fresh } : prev)
      })
      .catch(() => {}) // silent — cached data already shown
  }

  // ── Single-email actions ────────────────────────────────────────────────────

  async function handleMarkUnread(email) {
    setEmailRead(email.id, false)
    markEmailUnread(email.id, email.account).catch(() => setEmailRead(email.id, true))
  }

  async function handleReclassify(email, newCategory) {
    const prev = { category: email.category, defaultFrom: email.defaultFrom }
    updateEmailFields(email.id, { category: newCategory })
    try {
      const result = await reclassifyEmail(email.id, newCategory)
      updateEmailFields(email.id, { category: result.category, defaultFrom: result.defaultFrom })
    } catch {
      updateEmailFields(email.id, prev)
    }
  }

  async function handleArchive(email) {
    setEmails((prev) => prev.filter((e) => e.id !== email.id))
    if (selectedEmail?.id === email.id) setSelectedEmail(null)
    archiveEmail(email.id, email.account).catch(() => {
      setEmails((prev) => [...prev, email].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)))
    })
  }

  // ── Bulk selection ──────────────────────────────────────────────────────────

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────

  async function handleBulkArchive() {
    const ids = new Set(selectedIds)
    const toArchive = emails.filter((e) => ids.has(e.id))
    clearSelection()
    setEmails((prev) => prev.filter((e) => !ids.has(e.id)))
    if (selectedEmail && ids.has(selectedEmail.id)) setSelectedEmail(null)
    await Promise.allSettled(toArchive.map((e) => archiveEmail(e.id, e.account)))
  }

  async function handleBulkMarkRead(read) {
    const ids = new Set(selectedIds)
    const targets = emails.filter((e) => ids.has(e.id))
    clearSelection()
    setEmails((prev) => prev.map((e) => {
      if (!ids.has(e.id)) return e
      const status = !read ? 'unread' : (e.status === 'unread' ? 'read' : e.status)
      return { ...e, read, status }
    }))
    await Promise.allSettled(
      targets.map((e) => read ? markEmailRead(e.id, e.account) : markEmailUnread(e.id, e.account))
    )
  }

  async function handleBulkReclassify(newCategory) {
    const ids = new Set(selectedIds)
    clearSelection()
    setEmails((prev) => prev.map((e) => ids.has(e.id) ? { ...e, category: newCategory } : e))
    const targets = emails.filter((e) => ids.has(e.id))
    await Promise.allSettled(targets.map((e) => reclassifyEmail(e.id, newCategory)))
  }

  // ── Active nav view id ──────────────────────────────────────────────────────

  const activeNavId = viewMode === 'archived' ? 'archived' : sidebarView

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="email-agent">
      <div className="page-header">
        <div className="page-header-icon"><IconEmail /></div>
        <div>
          <div className="page-header-title">Email Agent</div>
          <div className="page-header-subtitle">
            support@shirtschool.com · kerry@shirtschool.com
          </div>
        </div>
        <div className="page-header-right">
          {unreadCount > 0 && !loading && viewMode === 'inbox' && (
            <span className="header-unread-badge">{unreadCount} unread</span>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => fetchEmails(true)}
            disabled={refreshing || loading}
            title="Refresh emails"
          >
            <IconRefresh />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="email-agent-body">
        {/* ── Left nav sidebar — always visible so switching views never flashes ── */}
        <nav className="email-nav">
          <div className="email-nav-section">
            <div className="email-nav-section-label">Status</div>
            {NAV_STATUS_VIEWS.map(({ id, label }) => (
              <button
                key={id}
                className={`email-nav-item ${activeNavId === id ? 'active' : ''}`}
                onClick={() => handleNavClick(id)}
              >
                {label}
                {id !== 'archived' && counts[id] > 0 && (
                  <span className="email-nav-count">{counts[id]}</span>
                )}
              </button>
            ))}
          </div>
          <div className="email-nav-section">
            <div className="email-nav-section-label">Category</div>
            {NAV_CATEGORY_VIEWS.map(({ id, label }) => (
              <button
                key={id}
                className={`email-nav-item ${activeNavId === id ? 'active' : ''}`}
                onClick={() => handleNavClick(id)}
              >
                {label}
                {counts[id] > 0 && (
                  <span className="email-nav-count">{counts[id]}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {loading ? (
          // Skeleton only fills the list panel — nav stays visible above
          <div className="email-agent-loading">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="email-list-skeleton">
                <div className="skeleton-avatar" />
                <div className="skeleton-lines">
                  <div className="skeleton-line" style={{ width: '55%' }} />
                  <div className="skeleton-line" style={{ width: '85%' }} />
                  <div className="skeleton-line" style={{ width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="email-agent-error">
            <p>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => fetchEmails()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <EmailList
              emails={filteredEmails}
              selectedId={selectedEmail?.id}
              onSelect={handleSelectEmail}
              viewMode={viewMode}
              onArchive={handleArchive}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onBulkArchive={handleBulkArchive}
              onBulkMarkRead={handleBulkMarkRead}
              onBulkReclassify={handleBulkReclassify}
              onClearSelection={clearSelection}
            />

            <div className="email-detail-wrapper">
              {selectedEmail ? (
                <EmailDetail
                  key={selectedEmail.id}
                  email={selectedEmail}
                  connectedAccounts={connectedAccounts}
                  onMarkUnread={handleMarkUnread}
                  onReclassify={handleReclassify}
                  onArchive={handleArchive}
                  viewMode={viewMode}
                />
              ) : (
                <div className="email-empty-state">
                  {filteredEmails.length === 0
                    ? (viewMode === 'archived' ? 'No archived emails.' : 'Nothing here.')
                    : 'Select an email to read and draft a reply.'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
