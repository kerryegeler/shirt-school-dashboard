import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import EmailList from './EmailList.jsx'
import EmailDetail from './EmailDetail.jsx'
import {
  markEmailRead, markEmailUnread, reclassifyEmail, archiveEmail, fetchThread,
  fetchFolders, createFolder, deleteFolder, assignFolder, searchEmails,
} from '../../services/api.js'
import './EmailAgent.css'

// ─── Icons ───────────────────────────────────────────────────────────────────

const IconEmail = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
  </svg>
)

const IconFolder = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" />
  </svg>
)

const IconPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10" />
  </svg>
)

const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l1 9h6l1-9" />
  </svg>
)

// Recycling arrows refresh icon
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
)

const IconSearch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="5" />
    <path d="M10.5 10.5l4 4" />
  </svg>
)

const IconClose = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

const IconMarkRead = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
    <path d="M5 10.5l2 2 4-4.5" />
  </svg>
)

const IconMarkUnread = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
    <circle cx="12.5" cy="4.5" r="2.5" fill="currentColor" stroke="none" />
  </svg>
)

const IconTag = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 1h6.5l7 7-6.5 6.5-7-7V1z" />
    <circle cx="5" cy="5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const IconFolderBulk = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V4z" />
  </svg>
)

const IconArchiveBulk = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="4" rx="1" />
    <path d="M2 5v9a1 1 0 001 1h10a1 1 0 001-1V5" />
    <path d="M6 9h4" />
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8l4 4 6-7" />
  </svg>
)

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_STATUS_VIEWS = [
  { id: 'inbox',    label: 'Inbox' },
  { id: 'archived', label: 'Archived' },
]

const NAV_CATEGORY_VIEWS = [
  { id: 'student_support', label: 'Support' },
  { id: 'sponsorship',     label: 'Sponsorship' },
  { id: 'general',         label: 'Spam' },
]

const CATEGORY_OPTIONS = [
  { value: 'student_support', label: 'Support' },
  { value: 'sponsorship',     label: 'Sponsorship' },
  { value: 'general',         label: 'Spam' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailAgent({ onUnreadChange, connectedAccounts = [] }) {
  // Core email state
  const [emails, setEmails] = useState([])
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [sidebarView, setSidebarView] = useState('inbox')
  const [viewMode, setViewMode] = useState('inbox') // 'inbox' | 'archived'
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Pagination
  const [nextPageTokens, setNextPageTokens] = useState(null)
  const [totalEstimate, setTotalEstimate] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const searchInputRef = useRef(null)

  // Folders
  const [folders, setFolders] = useState([])
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Bulk toolbar state (lives here now — toolbar rendered in right panel)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  // ── Fetch emails ────────────────────────────────────────────────────────────

  const fetchEmails = useCallback(async (isRefresh = false, mode = null, pageTokens = null) => {
    const currentMode = mode ?? viewMode
    const isLoadMore = pageTokens !== null

    if (isLoadMore) setLoadingMore(true)
    else if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const base = currentMode === 'archived' ? '/api/emails?archived=true' : '/api/emails'
      const url = pageTokens
        ? `${base}&pageTokens=${encodeURIComponent(JSON.stringify(pageTokens))}`
        : base
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load emails')

      if (isLoadMore) {
        setEmails((prev) => {
          const existingIds = new Set(prev.map((e) => e.id))
          const newEmails = data.emails.filter((e) => !existingIds.has(e.id))
          return [...prev, ...newEmails].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        })
      } else {
        setEmails(data.emails)
        if (!isRefresh) setSelectedEmail(data.emails[0] || null)
      }

      setNextPageTokens(data.nextPageTokens || null)
      if (!isLoadMore) setTotalEstimate(data.totalEstimate || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [viewMode])

  // ── Search ──────────────────────────────────────────────────────────────────

  async function handleSearch(e) {
    e.preventDefault()
    const q = searchQuery.trim()
    if (!q) { handleClearSearch(); return }
    setIsSearchMode(true)
    setSearching(true)
    setSelectedEmail(null)
    setSelectedIds(new Set())
    setNextPageTokens(null)
    try {
      const data = await searchEmails(q)
      setEmails(data.emails)
      setTotalEstimate(data.emails.length)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  function handleClearSearch() {
    setSearchQuery('')
    setIsSearchMode(false)
    setSelectedEmail(null)
    fetchEmails()
  }

  // ── Load more ───────────────────────────────────────────────────────────────

  function handleLoadMore() {
    if (nextPageTokens && !loadingMore) fetchEmails(true, null, nextPageTokens)
  }

  // ── Select all ──────────────────────────────────────────────────────────────

  function handleSelectAll() {
    const allSelected = selectedIds.size === filteredEmails.length && filteredEmails.length > 0
    setSelectedIds(allSelected ? new Set() : new Set(filteredEmails.map((e) => e.id)))
    setShowCategoryPicker(false)
    setShowFolderPicker(false)
  }

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchEmails()
    fetchFolders().then(setFolders).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 2 minutes (inbox only, not during search)
  useEffect(() => {
    if (viewMode !== 'inbox' || isSearchMode) return
    const interval = setInterval(() => fetchEmails(true), 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchEmails, viewMode, isSearchMode])

  const unreadCount = emails.filter((e) => !e.read).length
  useEffect(() => {
    onUnreadChange?.(unreadCount)
  }, [unreadCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── View switching ──────────────────────────────────────────────────────────

  function handleNavClick(viewId) {
    if (isSearchMode) { setIsSearchMode(false); setSearchQuery('') }
    setNextPageTokens(null)
    setTotalEstimate(0)
    setSelectedIds(new Set())
    setShowCategoryPicker(false)
    setShowFolderPicker(false)

    if (viewId === 'archived') {
      if (viewMode !== 'archived') {
        setViewMode('archived')
        setSelectedEmail(null)
        setSidebarView('inbox')
        setEmails([])
        fetchEmails(true, 'archived')
      }
    } else {
      if (viewMode === 'archived') {
        setViewMode('inbox')
        setSelectedEmail(null)
        setEmails([])
        fetchEmails(true, 'inbox')
      }
      setSidebarView(viewId)
    }
  }

  // ── Filtered emails + counts ────────────────────────────────────────────────

  const filteredEmails = useMemo(() => {
    if (viewMode === 'archived') return emails
    switch (sidebarView) {
      case 'student_support': return emails.filter((e) => e.category === 'student_support')
      case 'sponsorship':     return emails.filter((e) => e.category === 'sponsorship')
      case 'general':         return emails.filter((e) => e.category === 'general')
      default: {
        if (folders.some((f) => f.id === sidebarView)) {
          return emails.filter((e) => e.folderId === sidebarView)
        }
        // Inbox: exclude threads that have been moved to a folder
        return emails.filter((e) => !e.folderId)
      }
    }
  }, [emails, viewMode, sidebarView, folders])

  const counts = useMemo(() => ({
    inbox:           emails.filter((e) => !e.folderId).length,
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
    setShowCategoryPicker(false)
    setShowFolderPicker(false)
    const primaryAccount = (email.accounts || [email.account])[0]
    if (!email.read) {
      setEmailRead(email.id, true)
      markEmailRead(email.id, primaryAccount).catch(() => setEmailRead(email.id, false))
    }
    fetchThread(email.id, primaryAccount)
      .then((fresh) => {
        if (!fresh) return
        setEmails((prev) => prev.map((e) => e.id === email.id ? { ...e, ...fresh } : e))
        setSelectedEmail((prev) => prev?.id === email.id ? { ...prev, ...fresh } : prev)
      })
      .catch(() => {})
  }

  // ── Single-email actions ────────────────────────────────────────────────────

  async function handleMarkUnread(email) {
    setEmailRead(email.id, false)
    const primaryAccount = (email.accounts || [email.account])[0]
    markEmailUnread(email.id, primaryAccount).catch(() => setEmailRead(email.id, true))
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
    const accounts = email.accounts || [email.account]
    Promise.allSettled(accounts.map((acct) => archiveEmail(email.id, acct))).then((results) => {
      if (results.every((r) => r.status === 'rejected')) {
        setEmails((prev) => [...prev, email].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)))
      }
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
    setShowCategoryPicker(false)
    setShowFolderPicker(false)
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────

  async function handleBulkArchive() {
    const ids = new Set(selectedIds)
    const toArchive = emails.filter((e) => ids.has(e.id))
    clearSelection()
    setEmails((prev) => prev.filter((e) => !ids.has(e.id)))
    if (selectedEmail && ids.has(selectedEmail.id)) setSelectedEmail(null)
    await Promise.allSettled(
      toArchive.flatMap((e) => (e.accounts || [e.account]).map((acct) => archiveEmail(e.id, acct)))
    )
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
      targets.map((e) => {
        const acct = (e.accounts || [e.account])[0]
        return read ? markEmailRead(e.id, acct) : markEmailUnread(e.id, acct)
      })
    )
  }

  async function handleBulkReclassify(newCategory) {
    const ids = new Set(selectedIds)
    clearSelection()
    setEmails((prev) => prev.map((e) => ids.has(e.id) ? { ...e, category: newCategory } : e))
    const targets = emails.filter((e) => ids.has(e.id))
    await Promise.allSettled(targets.map((e) => reclassifyEmail(e.id, newCategory)))
  }

  // ── Folder actions ──────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    const name = newFolderName.trim()
    if (!name) return
    setNewFolderName('')
    setAddingFolder(false)
    try {
      const folder = await createFolder(name)
      setFolders((prev) => [...prev, folder])
    } catch {}
  }

  async function handleDeleteFolder(folder) {
    setFolders((prev) => prev.filter((f) => f.id !== folder.id))
    if (sidebarView === folder.id) setSidebarView('inbox')
    setEmails((prev) => prev.map((e) => e.folderId === folder.id ? { ...e, folderId: null } : e))
    deleteFolder(folder.id).catch(() => setFolders((prev) => [...prev, folder]))
  }

  async function handleBulkAssignFolder(folderId) {
    const ids = new Set(selectedIds)
    clearSelection()
    setEmails((prev) => prev.map((e) => ids.has(e.id) ? { ...e, folderId: folderId || null } : e))
    const targets = emails.filter((e) => ids.has(e.id))
    await Promise.allSettled(targets.map((e) => assignFolder(e.id, folderId)))
  }

  // ── Draft indicator update ──────────────────────────────────────────────────

  function handleDraftSaved(threadId) {
    updateEmailFields(threadId, { hasDraft: true })
  }

  function handleDraftDeleted(threadId) {
    updateEmailFields(threadId, { hasDraft: false })
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activeNavId = viewMode === 'archived' ? 'archived' : sidebarView
  const anySelected = selectedIds.size > 0

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

        {/* Search bar */}
        <form className="email-search-form" onSubmit={handleSearch}>
          <div className="email-search-wrap">
            <span className="email-search-icon"><IconSearch /></span>
            <input
              ref={searchInputRef}
              className="email-search-input"
              placeholder="Search emails…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {isSearchMode && (
              <button type="button" className="email-search-clear" onClick={handleClearSearch} title="Clear search">
                <IconClose />
              </button>
            )}
          </div>
        </form>

        <div className="page-header-right">
          {unreadCount > 0 && !loading && viewMode === 'inbox' && !isSearchMode && (
            <span className="header-unread-badge">{unreadCount} unread</span>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => isSearchMode ? handleSearch({ preventDefault: () => {} }) : fetchEmails(true)}
            disabled={refreshing || loading || searching}
            title="Refresh emails"
          >
            <IconRefresh />
            {refreshing || searching ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="email-agent-body">
        {/* ── Left nav sidebar ── */}
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
                {id === 'inbox' && counts.inbox > 0 && (
                  <span className="email-nav-count">{counts.inbox}</span>
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

          <div className="email-nav-section">
            <div className="email-nav-section-label email-nav-section-label--folders">
              <span>Folders</span>
              <button
                className="folder-add-btn"
                title="New folder"
                onClick={() => { setAddingFolder(true); setNewFolderName('') }}
              >
                <IconPlus />
              </button>
            </div>
            {addingFolder && (
              <form
                className="folder-input-row"
                onSubmit={(e) => { e.preventDefault(); handleCreateFolder() }}
              >
                <input
                  className="folder-input"
                  autoFocus
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setAddingFolder(false)}
                />
                <button type="submit" className="folder-input-ok" disabled={!newFolderName.trim()}>
                  Add
                </button>
              </form>
            )}
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`email-nav-item folder-nav-item ${activeNavId === folder.id ? 'active' : ''}`}
                onClick={() => handleNavClick(folder.id)}
              >
                <span className="folder-nav-icon"><IconFolder /></span>
                <span className="folder-nav-name">{folder.name}</span>
                <button
                  className="folder-delete-btn"
                  title="Delete folder"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder) }}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        </nav>

        {/* ── Main content area ── */}
        {loading || searching ? (
          <div className="email-agent-spinner-area">
            <div className="email-spinner" />
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
              onSelectAll={handleSelectAll}
              totalCount={emails.length}
              totalEstimate={totalEstimate}
              nextPageTokens={nextPageTokens}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              isSearchMode={isSearchMode}
              searchQuery={searchQuery}
            />

            <div className="email-detail-wrapper">
              {/* ── Bulk toolbar (top of right panel) ── */}
              {anySelected && (
                <div className="bulk-toolbar-bar">
                  {/* Category picker popover */}
                  {showCategoryPicker && (
                    <div className="bulk-picker-popover">
                      {CATEGORY_OPTIONS.map(({ value, label }) => (
                        <button key={value} className="bulk-picker-option" onClick={() => { setShowCategoryPicker(false); handleBulkReclassify(value) }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Folder picker popover */}
                  {showFolderPicker && (
                    <div className="bulk-picker-popover">
                      {folders.length === 0 && <span className="bulk-picker-empty">No folders yet</span>}
                      {folders.map((f) => (
                        <button key={f.id} className="bulk-picker-option" onClick={() => { setShowFolderPicker(false); handleBulkAssignFolder(f.id) }}>
                          {f.name}
                        </button>
                      ))}
                      <button className="bulk-picker-option bulk-picker-remove" onClick={() => { setShowFolderPicker(false); handleBulkAssignFolder(null) }}>
                        Remove from folder
                      </button>
                    </div>
                  )}

                  <span className="bulk-bar-count">{selectedIds.size} selected</span>
                  <div className="bulk-bar-divider" />

                  <button className="bulk-bar-btn" title="Mark as read" onClick={() => handleBulkMarkRead(true)}>
                    <IconMarkRead />
                  </button>
                  <button className="bulk-bar-btn" title="Mark as unread" onClick={() => handleBulkMarkRead(false)}>
                    <IconMarkUnread />
                  </button>
                  <button
                    className={`bulk-bar-btn ${showCategoryPicker ? 'bulk-bar-btn--active' : ''}`}
                    title="Reclassify"
                    onClick={() => { setShowCategoryPicker((v) => !v); setShowFolderPicker(false) }}
                  >
                    <IconTag />
                  </button>
                  <button
                    className={`bulk-bar-btn ${showFolderPicker ? 'bulk-bar-btn--active' : ''}`}
                    title="Move to folder"
                    onClick={() => { setShowFolderPicker((v) => !v); setShowCategoryPicker(false) }}
                  >
                    <IconFolderBulk />
                  </button>
                  <button className="bulk-bar-btn" title="Archive selected" onClick={handleBulkArchive}>
                    <IconArchiveBulk />
                  </button>

                  <div className="bulk-bar-divider" />
                  <button className="bulk-bar-btn bulk-bar-btn--close" title="Clear selection" onClick={clearSelection}>
                    <IconClose />
                  </button>
                </div>
              )}

              {selectedEmail ? (
                <EmailDetail
                  key={selectedEmail.id}
                  email={selectedEmail}
                  connectedAccounts={connectedAccounts}
                  onMarkUnread={handleMarkUnread}
                  onReclassify={handleReclassify}
                  onArchive={handleArchive}
                  viewMode={viewMode}
                  onDraftSaved={handleDraftSaved}
                  onDraftDeleted={handleDraftDeleted}
                />
              ) : (
                <div className="email-empty-state">
                  {filteredEmails.length === 0
                    ? (isSearchMode ? 'No results.' : viewMode === 'archived' ? 'No archived emails.' : 'Nothing here.')
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
