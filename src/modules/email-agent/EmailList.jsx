import './EmailAgent.css'

const CATEGORY_LABELS = {
  student_support: 'Student Support',
  sponsorship: 'Sponsorship',
  general: 'Spam',
}

const CATEGORY_BADGE_CLASS = {
  student_support: 'badge badge-support',
  sponsorship: 'badge badge-sponsorship',
  general: 'badge badge-general',
}

const AVATAR_COLORS = [
  '#2563eb', '#7c3aed', '#059669', '#dc2626',
  '#0891b2', '#d97706', '#db2777', '#65a30d',
]

function getAvatarColor(name) {
  return AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length]
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatRelativeTime(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return `${diffDays}d`
}

// ─── Icons ─────────────────────────────────────────────────────────────────

const IconArchiveRow = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="12" height="3" rx="1" />
    <path d="M2 4v8a1 1 0 001 1h8a1 1 0 001-1V4" />
    <path d="M5 7h4" />
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8l4 4 6-7" />
  </svg>
)

const IconSelectAll = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="14" rx="2" />
    <path d="M4 8l3 3 5-5" />
  </svg>
)

const IconDeselectAll = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="14" rx="2" />
    <path d="M5 5l6 6M11 5l-6 6" />
  </svg>
)

// ─── Main component ─────────────────────────────────────────────────────────

export default function EmailList({
  emails, selectedId, onSelect, viewMode, onArchive,
  selectedIds, onToggleSelect, onSelectAll,
  totalEstimate, nextPageTokens, onLoadMore, loadingMore,
  isSearchMode, searchQuery,
}) {
  const anySelected = selectedIds.size > 0
  const allSelected = emails.length > 0 && selectedIds.size === emails.length
  const showLoadMore = !!nextPageTokens && !isSearchMode

  return (
    <div className="email-list-panel">
      {/* ── Slim header ── */}
      <div className="email-list-header">
        <div className="email-list-header-left">
          <button
            className={`select-all-btn ${allSelected ? 'select-all-btn--active' : ''}`}
            onClick={onSelectAll}
            title={allSelected ? 'Deselect all' : 'Select all'}
          >
            {allSelected ? <IconDeselectAll /> : <IconSelectAll />}
          </button>
          {isSearchMode ? (
            <span className="email-count">Results for &ldquo;{searchQuery}&rdquo;</span>
          ) : (
            <span className="email-count">
              {showLoadMore
                ? `${emails.length} of ~${totalEstimate}`
                : `${emails.length} thread${emails.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        {anySelected && (
          <span className="email-selected-count">{selectedIds.size} selected</span>
        )}
      </div>

      {/* ── Scrollable list ── */}
      <div className="email-list">
        {emails.length === 0 && (
          <div className="email-list-empty">
            {isSearchMode ? 'No results.' : viewMode === 'archived' ? 'No archived emails.' : 'Nothing here.'}
          </div>
        )}
        {emails.map((email) => {
          const isChecked = selectedIds.has(email.id)
          return (
            <div
              key={email.id}
              className={`email-list-item ${selectedId === email.id ? 'selected' : ''} ${!email.read ? 'unread' : ''} ${isChecked ? 'bulk-checked' : ''}`}
              onClick={() => onSelect(email)}
            >
              <div
                className={`email-item-avatar ${isChecked ? 'avatar-checked' : ''}`}
                style={!isChecked ? { background: getAvatarColor(email.name) } : undefined}
                onClick={(e) => { e.stopPropagation(); onToggleSelect(email.id) }}
                title={isChecked ? 'Deselect' : 'Select'}
              >
                {isChecked ? <IconCheck /> : getInitials(email.name)}
                {!email.read && !isChecked && <span className="email-avatar-unread-dot" />}
              </div>

              <div className="email-item-content">
                <div className="email-item-top">
                  <span className="sender-name">{email.name}</span>
                  <div className="email-item-top-right">
                    {email.messages?.length > 1 && (
                      <span className="thread-count">{email.messages.length}</span>
                    )}
                    <span className="email-item-time">{formatRelativeTime(email.timestamp)}</span>
                  </div>
                </div>
                <div className="email-item-subject">{email.subject}</div>
                <div className="email-item-bottom">
                  <span className={CATEGORY_BADGE_CLASS[email.category]}>
                    {CATEGORY_LABELS[email.category]}
                  </span>
                  {email.hasDraft && (
                    <span className="draft-indicator">Draft</span>
                  )}
                  <span className="email-item-preview">{email.preview}</span>
                </div>
              </div>

              {viewMode === 'inbox' && !anySelected && (
                <button
                  className="email-archive-btn"
                  title="Archive"
                  onClick={(e) => { e.stopPropagation(); onArchive(email) }}
                >
                  <IconArchiveRow />
                </button>
              )}
            </div>
          )
        })}

        {/* ── Load more ── */}
        {showLoadMore && (
          <button className="load-more-btn" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <><span className="load-more-spinner" />Loading…</> : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
