import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  fetchChatWidgets, createChatWidget, updateChatWidget, deleteChatWidget,
  fetchChatConversations, fetchChatTranscript,
} from '../../services/api.js'
import { useToast } from '../../components/ui/Toast.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import './ChatWidget.css'

// Mirrors the column defaults in supabase-setup.sql — keep the two in sync.
const NEW_WIDGET = {
  name: '',
  title: 'Chat with Kerry',
  subtitle: 'Usually replies in a few minutes',
  greeting: 'Hey! Question about the challenge? Ask away — this goes straight to my phone.',
  position: 'bottom-right',
  accent: '#e02b20',
  ask_email: true,
  slack_channel_id: '',
}

const IconChat = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 7.5a5.6 5.6 0 01-6 5.6 5.7 5.7 0 01-2.6-.6L2 14l1.3-3.4A5.6 5.6 0 012.7 7 5.7 5.7 0 018.3 1.5h.4A5.7 5.7 0 0114 7.2v.3z" />
  </svg>
)
const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
const IconPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10" />
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.5h6.8L12 4" />
  </svg>
)
const IconSend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

function timeAgo(iso) {
  if (!iso) return '—'
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

export default function ChatWidget() {
  const toast = useToast()
  const [widgets, setWidgets] = useState([])
  const [embedBase, setEmbedBase] = useState(null)
  const [slackReady, setSlackReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)     // NEW_WIDGET shape while creating
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [tab, setTab] = useState('setup')      // setup | conversations
  const [conversations, setConversations] = useState([])
  const [transcript, setTranscript] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await fetchChatWidgets()
      setWidgets(d.widgets || [])
      setEmbedBase(d.embedBase)
      setSlackReady(d.slackReady !== false)
      setSelectedId((prev) => prev || d.widgets?.[0]?.id || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const selected = widgets.find((w) => w.id === selectedId) || null
  const editing = draft || selected

  // Conversations refresh on a timer while the tab is open, so a chat that
  // comes in while Kerry is looking at the list shows up without a reload.
  useEffect(() => {
    if (tab !== 'conversations') return
    let cancelled = false
    const pull = () => {
      fetchChatConversations(selectedId)
        .then((c) => { if (!cancelled) setConversations(c) })
        .catch(() => {})
    }
    pull()
    const t = setInterval(pull, 15000)
    return () => { cancelled = true; clearInterval(t) }
  }, [tab, selectedId])

  const base = embedBase || window.location.origin

  const snippet = useMemo(() => {
    if (!selected) return ''
    return `<script src="${base}/widgets/chat.js" data-widget="${selected.id}" async></script>`
  }, [base, selected])

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.show('Could not copy — select the code and copy it manually', { variant: 'error' })
    }
  }

  function setField(key, value) {
    if (draft) setDraft((d) => ({ ...d, [key]: value }))
    else setWidgets((ws) => ws.map((w) => (w.id === selectedId ? { ...w, [key]: value } : w)))
  }

  async function saveDraft() {
    if (!draft.name.trim()) { toast.show('Give the widget a name first', { variant: 'error' }); return }
    setSaving(true)
    try {
      const created = await createChatWidget(draft)
      setWidgets((ws) => [created, ...ws])
      setSelectedId(created.id)
      setDraft(null)
      toast.show('Widget created — copy the embed code below', { variant: 'success' })
    } catch (err) {
      toast.show(err.message, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function saveExisting() {
    setSaving(true)
    try {
      const { id, conversations: _c, lastAt: _l, created_at: _ca, ...fields } = selected
      await updateChatWidget(id, fields)
      toast.show('Saved — live pages pick this up within a minute', { variant: 'success' })
    } catch (err) {
      toast.show(err.message, { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function doDelete(widget) {
    try {
      await deleteChatWidget(widget.id)
      setWidgets((ws) => ws.filter((w) => w.id !== widget.id))
      if (selectedId === widget.id) setSelectedId(null)
      toast.show('Widget deleted', { variant: 'success' })
    } catch (err) {
      toast.show(err.message, { variant: 'error' })
    } finally {
      setConfirmDelete(null)
    }
  }

  async function openTranscript(conv) {
    try {
      const d = await fetchChatTranscript(conv.id)
      setTranscript(d)
    } catch (err) {
      toast.show(err.message, { variant: 'error' })
    }
  }

  return (
    <div className="chat-widget">
      <div className="page-header">
        <div className="page-header-icon"><IconChat /></div>
        <div>
          <div className="page-header-title">Chat Widget</div>
          <div className="page-header-subtitle">Visitors chat on your page — you answer from Slack</div>
        </div>
      </div>

      {!slackReady && (
        <div className="cw-warning">
          Slack isn’t wired up for chat yet. Set <code>SLACK_BOT_TOKEN</code> and{' '}
          <code>SLACK_CHAT_CHANNEL_ID</code> in the server environment — until then messages are
          saved here but you won’t be notified.
        </div>
      )}

      <div className="cw-body">
        {/* ── Left: the list of embeds ── */}
        <div className="cw-list-panel">
          <div className="cw-list-head">
            <span>Widgets</span>
            <button className="btn btn-primary cw-new-btn" onClick={() => { setDraft({ ...NEW_WIDGET }); setTab('setup') }}>
              <IconPlus /> New
            </button>
          </div>

          {loading && <div className="cw-note">Loading…</div>}
          {!loading && error && <div className="cw-note cw-note-error">{error}</div>}
          {!loading && !error && !widgets.length && !draft && (
            <div className="cw-note">
              No widgets yet. Create one for each page you want a chat bubble on — a sales page and
              a checkout page can greet people differently.
            </div>
          )}

          {draft && (
            <div className="cw-list-item active">
              <div className="cw-list-name">{draft.name || 'New widget'}</div>
              <div className="cw-list-meta">Unsaved</div>
            </div>
          )}

          {widgets.map((w) => (
            <div
              key={w.id}
              className={`cw-list-item ${!draft && selectedId === w.id ? 'active' : ''}`}
              onClick={() => { setDraft(null); setSelectedId(w.id); setTranscript(null) }}
            >
              <div className="cw-list-name">{w.name}</div>
              <div className="cw-list-meta">
                {w.conversations || 0} chat{w.conversations === 1 ? '' : 's'}
                {w.lastAt ? ` · ${timeAgo(w.lastAt)}` : ''}
              </div>
              <button
                className="cw-list-delete"
                title="Delete widget"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(w) }}
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>

        {/* ── Middle: settings + embed code ── */}
        <div className="cw-main-panel">
          {!editing && !loading && (
            <div className="cw-empty">Select a widget, or create one to get an embed code.</div>
          )}

          {editing && (
            <>
              <div className="cw-tabs">
                <button className={`cw-tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>Setup</button>
                <button
                  className={`cw-tab ${tab === 'conversations' ? 'active' : ''}`}
                  onClick={() => setTab('conversations')}
                  disabled={!!draft}
                >
                  Conversations
                </button>
              </div>

              {tab === 'setup' && (
                <div className="cw-form">
                  <label className="cw-label">
                    Widget name <span className="cw-hint">just for you — e.g. “Checkout page”</span>
                  </label>
                  <input className="cw-input" value={editing.name || ''} onChange={(e) => setField('name', e.target.value)} />

                  <div className="cw-row">
                    <div className="cw-field">
                      <label className="cw-label">Header title</label>
                      <input className="cw-input" value={editing.title || ''} onChange={(e) => setField('title', e.target.value)} />
                    </div>
                    <div className="cw-field">
                      <label className="cw-label">Header subtitle</label>
                      <input className="cw-input" value={editing.subtitle || ''} onChange={(e) => setField('subtitle', e.target.value)} />
                    </div>
                  </div>

                  <label className="cw-label">
                    Greeting <span className="cw-hint">the first bubble they see, before they type</span>
                  </label>
                  <textarea className="cw-input cw-textarea" rows={3} value={editing.greeting || ''} onChange={(e) => setField('greeting', e.target.value)} />

                  <div className="cw-row">
                    <div className="cw-field">
                      <label className="cw-label">Position</label>
                      <select className="cw-input" value={editing.position} onChange={(e) => setField('position', e.target.value)}>
                        <option value="bottom-right">Bottom right</option>
                        <option value="bottom-left">Bottom left</option>
                      </select>
                    </div>
                    <div className="cw-field">
                      <label className="cw-label">Accent color</label>
                      <div className="cw-color-wrap">
                        <input type="color" className="cw-color" value={editing.accent} onChange={(e) => setField('accent', e.target.value)} />
                        <span className="cw-color-code">{editing.accent}</span>
                      </div>
                    </div>
                    <div className="cw-field">
                      <label className="cw-label">Ask for name + email</label>
                      <select
                        className="cw-input"
                        value={editing.ask_email ? 'yes' : 'no'}
                        onChange={(e) => setField('ask_email', e.target.value === 'yes')}
                      >
                        <option value="yes">Yes (recommended)</option>
                        <option value="no">No — just let them type</option>
                      </select>
                    </div>
                  </div>

                  <label className="cw-label">
                    Slack channel ID <span className="cw-hint">optional — leave blank to use the default chat channel</span>
                  </label>
                  <input
                    className="cw-input"
                    placeholder="C01ABCDEFGH"
                    value={editing.slack_channel_id || ''}
                    onChange={(e) => setField('slack_channel_id', e.target.value)}
                  />

                  <div className="cw-actions">
                    {draft ? (
                      <>
                        <button className="btn btn-primary" onClick={saveDraft} disabled={saving}>
                          {saving ? 'Creating…' : 'Create widget'}
                        </button>
                        <button className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-primary" onClick={saveExisting} disabled={saving}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    )}
                  </div>

                  {selected && !draft && (
                    <>
                      <div className="cw-section-title">Embed code</div>
                      <div className="cw-snippet"><code>{snippet}</code></div>
                      <button className="btn btn-primary cw-copy-btn" onClick={copySnippet}>
                        {copied ? <><IconCheck /> Copied!</> : <><IconCopy /> Copy embed code</>}
                      </button>

                      <div className="cw-howto">
                        <div className="cw-howto-title">How to put it on a page</div>
                        <ol>
                          <li><b>Kajabi:</b> page editor → Settings → Page Scripts → paste into the <b>Footer</b> box.</li>
                          <li><b>Go High Level:</b> Funnel/Website → Settings → Tracking Code → <b>Footer</b>.</li>
                          <li>Save and reload the page — the bubble appears in the corner you picked.</li>
                          <li>Reply from the Slack thread. Anything you type there lands in their chat window.</li>
                          <li>Start a Slack reply with <code>!</code> to keep it private; send <code>!close</code> to end the chat.</li>
                        </ol>
                        <div className="cw-howto-note">
                          Same widget on several pages is fine. Use a separate widget when you want a
                          different greeting — like pre-purchase questions on checkout.
                        </div>
                        <div className="cw-howto-note">
                          Slack side, once: invite the dashboard bot to the channel you want chats in
                          (<code>/invite @your-bot</code>), then set that channel’s ID as{' '}
                          <code>SLACK_CHAT_CHANNEL_ID</code>. Each visitor becomes one thread.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {tab === 'conversations' && (
                <div className="cw-convos">
                  {!conversations.length && (
                    <div className="cw-note">
                      No chats yet for this widget. Once someone messages you, the thread shows up
                      here and in Slack.
                    </div>
                  )}
                  {conversations.map((c) => (
                    <div key={c.id} className="cw-convo-row" onClick={() => openTranscript(c)}>
                      <div className="cw-convo-top">
                        <span className="cw-convo-who">{c.visitor_name || c.visitor_email || 'Anonymous visitor'}</span>
                        <span className="cw-convo-time">{timeAgo(c.last_message_at)}</span>
                      </div>
                      <div className="cw-convo-last">{c.last || c.first || '—'}</div>
                      <div className="cw-convo-meta">
                        {c.count} message{c.count === 1 ? '' : 's'}
                        {c.status === 'closed' ? ' · closed' : ''}
                        {c.awaitingReply && c.status !== 'closed' ? ' · awaiting your reply' : ''}
                        {c.page_url ? ` · ${String(c.page_url).replace(/^https?:\/\//, '').slice(0, 40)}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: live preview of what visitors see ── */}
        {editing && (
          <div className="cw-preview-panel">
            <div className="cw-section-title">Preview</div>
            <div className={`cw-preview-stage ${editing.position === 'bottom-left' ? 'left' : 'right'}`} style={{ '--cw-accent': editing.accent }}>
              {previewOpen && (
                <div className="cw-preview-panel-box">
                  <div className="cw-preview-head">
                    <div>
                      <div className="cw-preview-title">{editing.title || 'Chat with Kerry'}</div>
                      <div className="cw-preview-sub">{editing.subtitle}</div>
                    </div>
                  </div>
                  <div className="cw-preview-log">
                    <div className="cw-preview-msg them">{editing.greeting}</div>
                    <div className="cw-preview-msg me">Is there a payment plan?</div>
                    <div className="cw-preview-msg them">Yep — 3 payments. Want the link?</div>
                  </div>
                  <div className="cw-preview-form">
                    {editing.ask_email && (
                      <div className="cw-preview-fields">
                        <span className="cw-preview-input">Your name</span>
                        <span className="cw-preview-input">Email</span>
                      </div>
                    )}
                    <div className="cw-preview-row">
                      <span className="cw-preview-input flex">Type your message…</span>
                      <span className="cw-preview-send"><IconSend /></span>
                    </div>
                  </div>
                </div>
              )}
              <button className="cw-preview-bubble" onClick={() => setPreviewOpen((o) => !o)} aria-label="Toggle preview">
                <IconChat />
              </button>
            </div>
            <div className="cw-preview-note">
              Click the bubble to see the closed state. This is a mock-up of the real widget —
              paste the embed code on a page for the live version.
            </div>
          </div>
        )}
      </div>

      {transcript && (
        <div className="cw-modal-overlay" onClick={() => setTranscript(null)}>
          <div className="cw-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cw-modal-head">
              <div>
                <div className="cw-modal-title">
                  {transcript.conversation.visitor_name || transcript.conversation.visitor_email || 'Anonymous visitor'}
                </div>
                <div className="cw-modal-sub">
                  {transcript.conversation.visitor_email || 'no email captured'}
                  {transcript.conversation.page_url ? ` · ${transcript.conversation.page_url}` : ''}
                </div>
              </div>
              <button className="cw-modal-close" onClick={() => setTranscript(null)}>×</button>
            </div>
            <div className="cw-modal-log">
              {transcript.messages.map((m) => (
                <div key={m.seq} className={`cw-preview-msg ${m.role === 'agent' ? 'them' : 'me'}`}>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="cw-modal-foot">Reply from the Slack thread — replies here would not reach the visitor.</div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${confirmDelete.name}”?`}
          message="Any page still running this embed code will stop showing the bubble. Past conversations stay in the database."
          confirmLabel="Delete"
          danger
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
