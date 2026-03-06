import { useState } from 'react'
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

const CATEGORY_OPTIONS = [
  { value: 'student_support', label: 'Support' },
  { value: 'sponsorship',     label: 'Sponsorship' },
  { value: 'general',         label: 'Spam' },
]

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

const IconArchiveBulk = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="4" rx="1" />
    <path d="M2 5v9a1 1 0 001 1h10a1 1 0 001-1V5" />
    <path d="M6 9h4" />
  </svg>
)

const IconClose = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)

// ─── Main component ─────────────────────────────────────────────────────────

export default function EmailList({
  emails, selectedId, onSelect, viewMode, onArchive,
  selectedIds, onToggleSelect,
  onBulkArchive, onBulkMarkRead, onBulkReclassify, onClearSelection,
}) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const anySelected = selectedIds.size > 0

  function handleReclassify(value) {
    setShowCategoryPicker(false)
    onBulkReclassify(value)
  }

  return (
    <div className="email-list-panel">
      {/* ── Slim header ── */}
      <div className="email-list-header">
        <span className="email-count">{emails.length} thread{emails.length !== 1 ? 's' : ''}</span>
        {anySelected && (
          <span className="email-selected-count">{selectedIds.size} selected</span>
        )}
      </div>

      {/* ── Scrollable list ── */}
      <div className="email-list">
        {emails.length === 0 && (
          <div className="email-list-empty">
            {viewMode === 'archived' ? 'No archived emails.' : 'Nothing here.'}
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
                  {email.status === 'awaiting_reply' && (
                    <span className="status-badge status-awaiting">Awaiting reply</span>
                  )}
                  {email.status === 'replied' && (
                    <span className="status-badge status-replied">Replied</span>
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
      </div>

      {/* ── Floating bulk toolbar (icon pill) ── */}
      {anySelected && (
        <div className="bulk-toolbar">
          {/* Category picker popover */}
          {showCategoryPicker && (
            <div className="bulk-category-picker">
              {CATEGORY_OPTIONS.map(({ value, label }) => (
                <button key={value} className="bulk-category-option" onClick={() => handleReclassify(value)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <span className="bulk-toolbar-count">{selectedIds.size}</span>
          <div className="bulk-toolbar-divider" />

          <button className="bulk-toolbar-btn" title="Mark as read" onClick={() => onBulkMarkRead(true)}>
            <IconMarkRead />
          </button>
          <button className="bulk-toolbar-btn" title="Mark as unread" onClick={() => onBulkMarkRead(false)}>
            <IconMarkUnread />
          </button>
          <button
            className={`bulk-toolbar-btn ${showCategoryPicker ? 'bulk-toolbar-btn--active' : ''}`}
            title="Reclassify"
            onClick={() => setShowCategoryPicker((v) => !v)}
          >
            <IconTag />
          </button>
          <button className="bulk-toolbar-btn" title="Archive" onClick={onBulkArchive}>
            <IconArchiveBulk />
          </button>

          <div className="bulk-toolbar-divider" />
          <button className="bulk-toolbar-btn bulk-toolbar-btn--close" title="Clear selection" onClick={() => { onClearSelection(); setShowCategoryPicker(false) }}>
            <IconClose />
          </button>
        </div>
      )}
    </div>
  )
}
