import { useState, useRef, useEffect } from 'react'
import { generateReply, sendEmail, fetchDraft, saveDraft, deleteDraft, logFeedback, forwardEmail } from '../../services/api.js'

const CATEGORY_LABELS = {
  student_support: 'Student Support',
  sponsorship: 'Sponsorship',
  general: 'Spam',
}

const PERSONA_INFO = {
  student_support: { label: 'Shirt School Support Team', description: 'Helpful & professional' },
  sponsorship:     { label: 'Support Team', description: 'Professional tone' },
  general:         null,
}

const CATEGORIES = [
  { value: 'student_support', label: 'Student Support' },
  { value: 'sponsorship',     label: 'Sponsorship' },
  { value: 'general',         label: 'Spam' },
]

// ─── Icons ────────────────────────────────────────────────────────────────────
const IconSparkle = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1v14M1 8h14M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </svg>
)
const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1" />
    <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8l5 5 7-8" />
  </svg>
)
const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.5 4A6.5 6.5 0 102 8.5" />
    <path d="M13.5 1v3h-3" />
  </svg>
)
const IconSend = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2L1 7l5 3 2 5 2-5 4-8z" />
  </svg>
)
const IconSave = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 13H3a1 1 0 01-1-1V2l3 3h7a1 1 0 011 1v6a1 1 0 01-1 1z" />
    <rect x="5" y="1" width="6" height="4" rx="0.5" />
    <rect x="4" y="9" width="8" height="3" rx="0.5" />
  </svg>
)
const IconEdit = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-9 9H2v-3L11 2z" />
  </svg>
)
const IconMarkUnread = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="14" height="10" rx="1.5" />
    <path d="M1 5l7 5 7-5" />
    <circle cx="13" cy="4" r="3" fill="var(--orange)" stroke="var(--bg-card)" strokeWidth="1.5" />
  </svg>
)
const IconArchive = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="4" rx="1" />
    <path d="M2 5v9a1 1 0 001 1h10a1 1 0 001-1V5" />
    <path d="M6 9h4" />
  </svg>
)
const IconInbox = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="14" height="14" rx="1.5" />
    <path d="M1 10h3.5l1.5 2h4l1.5-2H15" />
  </svg>
)
const IconChevron = ({ expanded }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
    <path d="M4 6l4 4 4-4" />
  </svg>
)

function formatFullDate(isoString) {
  return new Date(isoString).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function formatShortDate(isoString) {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

// ─── HTML email iframe ────────────────────────────────────────────────────────
function HtmlEmail({ html, msgId }) {
  const iframeRef = useRef(null)

  const injectedStyles = `<style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 8px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 14px; line-height: 1.6; color: #1C1C1E;
      word-wrap: break-word; overflow-wrap: break-word;
    }
    img { max-width: 100%; height: auto; }
    a { color: #0066CC; }
    pre, code { white-space: pre-wrap; font-size: 13px; }
    table { max-width: 100%; }
    blockquote { border-left: 3px solid #E5E5EA; margin: 0 0 0 8px; padding-left: 12px; color: #6C6C70; }
  </style>`

  const srcDoc = html.includes('</head>')
    ? html.replace('</head>', `${injectedStyles}</head>`)
    : `<!DOCTYPE html><html><head><meta charset="utf-8">${injectedStyles}</head><body>${html}</body></html>`

  function adjustHeight() {
    try {
      const doc = iframeRef.current?.contentDocument
      if (doc?.body) {
        const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
        iframeRef.current.style.height = `${h + 8}px`
      }
    } catch (_) { /* cross-origin edge case */ }
  }

  useEffect(() => {
    window.addEventListener('resize', adjustHeight)
    return () => window.removeEventListener('resize', adjustHeight)
  }, [])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      onLoad={adjustHeight}
      className="email-html-frame"
      title={`Email content${msgId ? ` (${msgId})` : ''}`}
    />
  )
}

// ─── Attachment pill ───────────────────────────────────────────────────────────
function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function attachmentIcon(mimeType) {
  if (!mimeType) return '📎'
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️'
  if (mimeType.includes('audio')) return '🎵'
  if (mimeType.includes('video')) return '🎬'
  return '📎'
}

function AttachmentList({ message }) {
  const atts = message.attachments || []
  if (!atts.length) return null

  return (
    <div className="thread-msg-attachments">
      <div className="attachments-label">Attachments ({atts.length})</div>
      <div className="attachments-grid">
        {atts.map((att) => {
          const url = `/api/emails/${message.id}/attachment/${att.attachmentId}?type=${encodeURIComponent(att.mimeType || '')}&account=${encodeURIComponent(message.account || '')}`
          const isImage = (att.mimeType || '').startsWith('image/')
          return (
            <div key={att.attachmentId} className="attachment-pill">
              {isImage ? (
                <a href={url} target="_blank" rel="noreferrer" className="attachment-image-link" title={att.filename}>
                  <img src={url} alt={att.filename || 'attachment'} loading="lazy" className="attachment-image-thumb" />
                </a>
              ) : (
                <div className="attachment-icon">{attachmentIcon(att.mimeType)}</div>
              )}
              <div className="attachment-info">
                <div className="attachment-name" title={att.filename}>{att.filename || 'unnamed'}</div>
                <div className="attachment-meta">{formatBytes(att.size)}</div>
              </div>
              <div className="attachment-actions">
                <a href={url} target="_blank" rel="noreferrer" className="attachment-btn">View</a>
                <a href={url} download={att.filename || 'attachment'} className="attachment-btn">Download</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Individual thread message ─────────────────────────────────────────────────
function ThreadMessage({ message, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const senderLabel = message.isOutgoing
    ? (message.senderName || message.from || 'You')
    : (message.senderName || message.from)

  return (
    <div className={`thread-msg ${message.isOutgoing ? 'thread-msg--outgoing' : 'thread-msg--incoming'}`}>
      <div className="thread-msg-header" onClick={() => setExpanded((v) => !v)}>
        <div
          className="thread-msg-avatar"
          style={{ background: message.isOutgoing ? 'var(--orange)' : getAvatarColor(senderLabel) }}
        >
          {getInitials(senderLabel)}
        </div>
        <div className="thread-msg-meta">
          <span className="thread-msg-sender">{senderLabel}</span>
          {message.isOutgoing && <span className="thread-msg-you-tag">You</span>}
          {!expanded && (
            <span className="thread-msg-preview-collapsed">
              {(message.bodyText || '').slice(0, 60)}…
            </span>
          )}
        </div>
        <span className="thread-msg-time">{formatShortDate(message.timestamp)}</span>
        <span className="thread-msg-toggle">
          <IconChevron expanded={expanded} />
        </span>
      </div>

      {expanded && (
        <div className="thread-msg-body">
          {message.isOutgoing ? (
            <pre className="thread-msg-text thread-msg-text--outgoing">
              {message.bodyText || message.body || '(no content)'}
            </pre>
          ) : message.bodyHtml ? (
            <div className="email-html-wrapper">
              <HtmlEmail html={message.bodyHtml} msgId={message.id} />
            </div>
          ) : (
            <pre className="thread-msg-text">{message.bodyText || message.body || '(no content)'}</pre>
          )}
          <AttachmentList message={message} />
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EmailDetail({ email, connectedAccounts = [], onMarkUnread, onReclassify, onArchive, onUnarchive, viewMode, onDraftSaved, onDraftDeleted, onSent }) {
  const [draft, setDraft] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [personaUsed, setPersonaUsed] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [fromAccount, setFromAccount] = useState(email.defaultFrom || connectedAccounts[0] || '')
  const [toEmail, setToEmail] = useState(email.from || '')
  const [editingTo, setEditingTo] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [showForward, setShowForward] = useState(false)
  const [forwardTo, setForwardTo] = useState('')
  const [forwardNote, setForwardNote] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [forwardError, setForwardError] = useState('')
  const [forwarded, setForwarded] = useState(false)
  const aiDraftRef = useRef('') // Original AI-generated draft before user edits

  // Load saved draft on mount
  useEffect(() => {
    if (email.hasDraft) {
      fetchDraft(email.id).then(({ content, originalAiDraft }) => {
        if (content) { setDraft(content); setManualMode(true) }
        if (originalAiDraft) aiDraftRef.current = originalAiDraft
      }).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const persona = PERSONA_INFO[email.category]

  const effectiveFrom = connectedAccounts.includes(fromAccount)
    ? fromAccount
    : connectedAccounts[0] || fromAccount

  // If we have thread messages, use them; otherwise fall back to single-message view
  const messages = email.messages && email.messages.length > 0 ? email.messages : null

  function handleWriteReply() {
    setManualMode(true)
    setDraft('')
    setPersonaUsed('')
    setError('')
    setSent(false)
    setSendError('')
    setConfirmSend(false)
  }

  async function handleGenerate() {
    setManualMode(false)
    setLoading(true)
    setError('')
    setCopied(false)
    setSent(false)
    setSendError('')
    setConfirmSend(false)
    try {
      const result = await generateReply(email, email.category)
      setDraft(result.draft)
      setPersonaUsed(result.persona)
      aiDraftRef.current = result.draft // Save original for feedback comparison
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleForward() {
    if (!forwardTo.trim()) { setForwardError('Recipient email is required'); return }
    setForwarding(true)
    setForwardError('')
    try {
      // Forward the latest inbound message in the thread
      const msgs = email.messages || []
      const latestInbound = [...msgs].reverse().find((m) => !m.isOutgoing) || msgs[msgs.length - 1]
      await forwardEmail({
        email, message: latestInbound,
        toEmail: forwardTo.trim(), fromAccount: effectiveFrom, note: forwardNote,
      })
      setForwarded(true)
      setTimeout(() => {
        setShowForward(false)
        setForwardTo(''); setForwardNote('')
        setForwarded(false)
      }, 1500)
    } catch (err) {
      setForwardError(err.message)
    } finally {
      setForwarding(false)
    }
  }

  async function handleSaveDraft() {
    if (!draft.trim()) return
    setSavingDraft(true)
    try {
      const original = aiDraftRef.current
      await saveDraft(email.id, draft, original || null)
      setDraftSavedAt(new Date())
      onDraftSaved?.(email.id)
      // Log feedback if draft differs from the AI original
      if (original && draft !== original) {
        logFeedback({ threadId: email.id, category: email.category, originalDraft: original, finalVersion: draft })
          .catch(() => {})
      }
    } catch {}
    finally { setSavingDraft(false) }
  }

  async function handleSend() {
    setSending(true)
    setSendError('')
    try {
      await sendEmail(email, draft, effectiveFrom, toEmail, manualMode)
      setSent(true)
      setConfirmSend(false)
      // Log feedback whenever the final sent version differs from the AI original
      const original = aiDraftRef.current
      if (original && draft !== original) {
        logFeedback({ threadId: email.id, category: email.category, originalDraft: original, finalVersion: draft })
          .catch(() => {})
      }
      // Delete saved draft on successful send
      deleteDraft(email.id).then(() => onDraftDeleted?.(email.id)).catch(() => {})
      // Notify parent to reload thread after a short delay (so Gmail has time to record the sent message)
      setTimeout(() => onSent?.(), 1500)
    } catch (err) {
      setSendError(err.message)
      setConfirmSend(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="email-detail-panel">
      {/* ── Thread Header ── */}
      <div className="detail-header">
        <div className="detail-header-top">
          <div className={`category-select-wrapper cat-${email.category}`}>
            <select
              className="category-select"
              value={email.category}
              onChange={(e) => onReclassify?.(email, e.target.value)}
              title="Change category"
            >
              {CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <span className="detail-inbox-tag" title={`Fetched via ${email.account}`}>
            {email.account}
          </span>
          {persona && (
            <span className="persona-tag">
              Reply as: <strong>{persona.label}</strong>
              <span className="persona-tone">{persona.description}</span>
            </span>
          )}
          <div className="detail-header-actions">
            <button
              className="btn-mark-unread"
              onClick={() => onMarkUnread?.(email)}
              title="Mark as unread"
            >
              <IconMarkUnread />
              Mark unread
            </button>
            {viewMode === 'inbox' && (
              <button
                className="btn-archive-detail"
                onClick={() => onArchive?.(email)}
                title="Archive thread"
              >
                <IconArchive />
                Archive
              </button>
            )}
            {viewMode === 'archived' && (
              <button
                className="btn-archive-detail"
                onClick={() => onUnarchive?.(email)}
                title="Move back to inbox"
              >
                <IconInbox />
                Move to Inbox
              </button>
            )}
          </div>
        </div>

        <div className="detail-subject-row">
          <h2 className="detail-subject">{email.subject}</h2>
          <div className="detail-subject-meta">
            {messages && messages.length > 1 && (
              <span className="thread-message-count">{messages.length} messages</span>
            )}
          </div>
        </div>

        <div className="detail-meta">
          <div className="detail-meta-row">
            <span className="meta-label">From</span>
            <span className="meta-value">{email.name} &lt;{email.from}&gt;</span>
          </div>
          <div className="detail-meta-row">
            <span className="meta-label">To</span>
            <span className="meta-value">{email.to}</span>
          </div>
          <div className="detail-meta-row">
            <span className="meta-label">Date</span>
            <span className="meta-value">{formatFullDate(email.timestamp)}</span>
          </div>
        </div>
      </div>

      {/* ── Thread Messages ── */}
      <div className="detail-body">
        {messages ? (
          <div className="thread-messages">
            {[...messages].reverse().map((msg, i) => (
              <ThreadMessage
                key={msg.id || i}
                message={msg}
                defaultExpanded={i === 0}
              />
            ))}
          </div>
        ) : (
          // Fallback: single message (old data shape)
          email.bodyHtml ? (
            <div className="email-html-wrapper">
              <HtmlEmail html={email.bodyHtml} />
            </div>
          ) : (
            <pre className="email-body-text">{email.bodyText || email.body}</pre>
          )
        )}
      </div>

      {/* ── AI Draft Section (hidden for sent emails) ── */}
      {viewMode === 'sent' ? null : <div className="draft-section">
        <div className="draft-section-header">
          <div className="draft-section-title">
            <span className="draft-sparkle-icon"><IconSparkle /></span>
            AI Draft Reply
          </div>
          {email.category === 'general' ? (
            <div className="no-reply-notice">Newsletter / spam — no reply needed.</div>
          ) : (
            <div className="draft-actions-top">
              <button
                className={`btn btn-secondary ${manualMode ? 'btn-active-outline' : ''}`}
                onClick={handleWriteReply}
                disabled={loading}
              >
                <IconEdit />Write Reply
              </button>
              <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                {draft && !manualMode ? (
                  <><IconRefresh />{loading ? 'Regenerating...' : 'Regenerate'}</>
                ) : (
                  <><IconSparkle />{loading ? 'Drafting...' : 'Generate Draft'}</>
                )}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForward(true)} disabled={loading}>
                ↪ Forward
              </button>
            </div>
          )}
        </div>

        {error && <div className="draft-error">{error}</div>}

        {loading && !draft && (
          <div className="draft-loading">
            <div className="loading-shimmer" />
            <div className="loading-shimmer" style={{ width: '85%' }} />
            <div className="loading-shimmer" style={{ width: '70%' }} />
          </div>
        )}

        {(draft || manualMode) && (
          <div className="draft-content">
            {connectedAccounts.length > 0 && (
              <div className="draft-from-row">
                <label className="draft-from-label">Send from</label>
                <select
                  className="draft-from-select"
                  value={effectiveFrom}
                  onChange={(e) => setFromAccount(e.target.value)}
                  disabled={sent}
                >
                  {connectedAccounts.map((acc) => (
                    <option key={acc} value={acc}>{acc}</option>
                  ))}
                </select>
                {email.defaultFrom &&
                  effectiveFrom !== email.defaultFrom &&
                  connectedAccounts.includes(email.defaultFrom) && (
                    <button
                      className="draft-from-reset"
                      onClick={() => setFromAccount(email.defaultFrom)}
                    >
                      Reset to suggested
                    </button>
                  )}
              </div>
            )}

            {personaUsed && (
              <div className="draft-persona-label">
                Drafted as: <strong>{personaUsed}</strong>
              </div>
            )}

            <div className="draft-to-row">
              <span className="draft-to-label">To:</span>
              {editingTo ? (
                <input
                  className="draft-to-input"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  onBlur={() => setEditingTo(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTo(false) }}
                  autoFocus
                  placeholder="recipient@example.com"
                />
              ) : (
                <button
                  className="draft-to-value"
                  onClick={() => !sent && setEditingTo(true)}
                  title={sent ? undefined : 'Click to edit recipient'}
                  disabled={sent}
                >
                  {toEmail || email.from}
                  {!sent && <span className="draft-to-edit-hint">✎</span>}
                </button>
              )}
            </div>

            <textarea
              className="draft-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              disabled={sent}
              placeholder={manualMode && !draft ? 'Write your reply here...' : ''}
            />

            {sendError && <div className="draft-error" style={{ marginTop: 8 }}>{sendError}</div>}

            {confirmSend ? (
              <div className="send-confirm-bar">
                <span className="send-confirm-text">
                  Send to <strong>{toEmail || email.from}</strong> from <strong>{effectiveFrom}</strong>?
                </span>
                <button className="btn btn-ghost" onClick={() => setConfirmSend(false)}>Cancel</button>
                <button className="btn btn-send" onClick={handleSend} disabled={sending}>
                  <IconSend />{sending ? 'Sending...' : 'Send Now'}
                </button>
              </div>
            ) : (
              <div className="draft-footer">
                <span className="draft-hint">
                  {sent
                    ? `Sent from ${effectiveFrom}.`
                    : draftSavedAt
                      ? `Draft saved ${draftSavedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                      : 'Edit above — nothing sends without your approval.'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSaveDraft}
                    disabled={sent || savingDraft || !draft.trim()}
                    title="Save draft to resume later"
                  >
                    <IconSave />
                    {savingDraft ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button
                    className={`btn ${copied ? 'btn-success' : 'btn-secondary'}`}
                    onClick={handleCopy}
                    disabled={sent}
                  >
                    {copied ? <IconCheck /> : <IconCopy />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  {sent ? (
                    <button className="btn btn-success"><IconCheck />Sent</button>
                  ) : (
                    <button className="btn btn-send" onClick={() => setConfirmSend(true)} disabled={sending}>
                      <IconSend />Send via Gmail
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>}

      {showForward && (
        <div className="forward-modal-overlay" onClick={() => !forwarding && setShowForward(false)}>
          <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
            <div className="forward-modal-header">
              <h3>Forward Email</h3>
              <button className="icon-btn" onClick={() => setShowForward(false)} disabled={forwarding}>✕</button>
            </div>
            <div className="forward-modal-body">
              <label className="forward-label">To</label>
              <input
                type="email"
                className="forward-input"
                placeholder="recipient@example.com"
                value={forwardTo}
                onChange={(e) => setForwardTo(e.target.value)}
                autoFocus
                disabled={forwarding || forwarded}
              />
              <label className="forward-label">Add a note (optional)</label>
              <textarea
                className="forward-textarea"
                placeholder="FYI — thought you'd want to see this."
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                rows={3}
                disabled={forwarding || forwarded}
              />
              <div className="forward-preview">
                <div className="forward-preview-label">Forwarded content:</div>
                <div className="forward-preview-text">
                  <strong>From:</strong> {email.from}<br />
                  <strong>Subject:</strong> {email.subject}<br />
                  <strong>Preview:</strong> {(email.bodyText || '').slice(0, 200)}…
                </div>
              </div>
              {forwardError && <div className="forward-error">{forwardError}</div>}
            </div>
            <div className="forward-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowForward(false)} disabled={forwarding}>Cancel</button>
              <button className="btn btn-primary" onClick={handleForward} disabled={forwarding || forwarded || !forwardTo.trim()}>
                {forwarded ? '✓ Forwarded' : forwarding ? 'Forwarding…' : 'Forward'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
