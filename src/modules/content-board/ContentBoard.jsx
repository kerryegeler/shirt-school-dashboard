import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  fetchContentCards, createContentCard, updateContentCard,
  deleteContentCard, regenerateCardSections,
} from '../../services/api.js'
import { formatDate } from '../../utils/format.js'
import './ContentBoard.css'

// ─── Column definitions (each carries its own vibrant accent color) ──────────────

const LONG_FORM_COLUMNS = [
  { id: 'idea',            label: 'Idea',            color: '#8b5cf6' },
  { id: 'scripting',       label: 'Scripting',       color: '#3b82f6' },
  { id: 'ready_to_record', label: 'Ready to Record', color: '#06b6d4' },
  { id: 'recorded',        label: 'Recorded',        color: '#f59e0b' },
  { id: 'editing',         label: 'Editing',         color: '#ec4899' },
  { id: 'published',       label: 'Published',       color: '#22c55e' },
]

const SHORT_FORM_COLUMNS = [
  { id: 'idea',          label: 'Idea',          color: '#8b5cf6' },
  { id: 'hook_written',  label: 'Hook Written',  color: '#3b82f6' },
  { id: 'ready_to_film', label: 'Ready to Film', color: '#f59e0b' },
  { id: 'published',     label: 'Published',     color: '#22c55e' },
]

// Section configs drive both display + edit. `type` controls rendering:
//   list → numbered list (pasted blobs get split into items)
//   text → paragraphs with clickable links
//   tags → colored chips
const LONG_FORM_SECTIONS = [
  { key: 'title_ideas',    label: 'Title Ideas',    type: 'list' },
  { key: 'hook_script',    label: 'Hook Script',    type: 'text' },
  { key: 'main_points',    label: 'Main Points',    type: 'list' },
  { key: 'cta',            label: 'CTA',            type: 'text' },
  { key: 'thumbnail_idea', label: 'Thumbnail Idea', type: 'text' },
  { key: 'tags',           label: 'Tags',           type: 'tags' },
]

const SHORT_FORM_SECTIONS = [
  { key: 'title_ideas', label: 'Title Ideas', type: 'list' },
  { key: 'hook_script', label: 'Hook Script', type: 'text' },
  { key: 'main_points', label: 'Main Points', type: 'list' },
  { key: 'cta',         label: 'CTA',         type: 'text' },
  { key: 'tags',        label: 'Tags',        type: 'tags' },
]

// Color labels users can pin to a card for at-a-glance scanning.
const LABELS = [
  { id: 'priority',  name: 'Priority',  color: '#ef4444' },
  { id: 'sponsored', name: 'Sponsored', color: '#22c55e' },
  { id: 'series',    name: 'Series',    color: '#3b82f6' },
  { id: 'evergreen', name: 'Evergreen', color: '#8b5cf6' },
  { id: 'trending',  name: 'Trending',  color: '#f59e0b' },
  { id: 'collab',    name: 'Collab',    color: '#ec4899' },
]
const LABEL_BY_ID = Object.fromEntries(LABELS.map((l) => [l.id, l]))

// ─── Icons ─────────────────────────────────────────────────────────────────────

const IconPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10" />
  </svg>
)
const IconX = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
)
const IconSparkle = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5L8 1z" />
  </svg>
)
const IconRefresh = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 016-6 6.3 6.3 0 014.5 1.8L14 5" />
    <path d="M14 2v3h-3" />
    <path d="M14 8a6 6 0 01-6 6 6.3 6.3 0 01-4.5-1.8L2 11" />
    <path d="M2 14v-3h3" />
  </svg>
)
const IconTrash = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h10M6 4V3h4v1M5 4l.5 8h5L11 4" />
  </svg>
)
const IconEdit = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 2l3 3-9 9H2v-3L11 2z" />
  </svg>
)
const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
  </svg>
)
const IconCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 4" />
  </svg>
)
const IconLink = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 9.5l3-3M7 4l.8-.8a2.8 2.8 0 014 4l-.8.8M9 12l-.8.8a2.8 2.8 0 01-4-4l.8-.8" />
  </svg>
)
const IconSearch = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
)
const IconGrip = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" />
    <circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" />
    <circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" />
  </svg>
)

// ─── Text helpers (list parsing + link detection) ────────────────────────────────

// Turn a value (array OR a pasted blob of text) into discrete list items.
// Handles: newline-separated lines, a single line with "1. … 2. …" markers,
// and bullet characters. Leading numbering/bullets are stripped.
function parseListItems(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 1) {
    const single = lines[0]
    const byNum = single.split(/\s+(?=\d+[.)]\s)/).map((s) => s.trim()).filter(Boolean)
    if (byNum.length > 1) {
      lines = byNum
    } else {
      const byBullet = single.split(/\s*[•·]\s*/).map((s) => s.trim()).filter(Boolean)
      if (byBullet.length > 1) lines = byBullet
    }
  }
  return lines.map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•·])\s*/, '').trim()).filter(Boolean)
}

function toTags(value) {
  if (Array.isArray(value)) return value.map((t) => String(t).trim()).filter(Boolean)
  return String(value || '').split(',').map((t) => t.trim()).filter(Boolean)
}

// Plain-text version of a section for the copy-to-clipboard button.
function sectionPlainText(type, value) {
  if (type === 'tags') return toTags(value).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
  if (type === 'list') return parseListItems(value).map((it, i) => `${i + 1}. ${it}`).join('\n')
  return String(value || '')
}

// What to prefill the edit textarea with.
function toEditText(type, value) {
  if (Array.isArray(value)) return value.join(type === 'tags' ? ', ' : '\n')
  return value || ''
}

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g

// Render a string with clickable links + preserved line breaks.
function Linkified({ text }) {
  const str = String(text ?? '')
  const out = []
  let last = 0
  let m
  URL_RE.lastIndex = 0
  while ((m = URL_RE.exec(str)) !== null) {
    if (m.index > last) out.push(str.slice(last, m.index))
    let url = m[0]
    let trail = ''
    const tm = url.match(/[.,!?:;)\]]+$/)
    if (tm) { trail = tm[0]; url = url.slice(0, -trail.length) }
    const href = url.startsWith('http') ? url : `https://${url}`
    out.push(
      <a key={out.length} href={href} target="_blank" rel="noopener noreferrer"
        className="cb-link" onClick={(e) => e.stopPropagation()}>{url}</a>
    )
    if (trail) out.push(trail)
    last = m.index + m[0].length
  }
  if (last < str.length) out.push(str.slice(last))
  return <>{out}</>
}

// Renders a section's value formatted by type.
function SectionValue({ type, value }) {
  if (type === 'tags') {
    const tags = toTags(value)
    if (!tags.length) return null
    return (
      <div className="cb-tags">
        {tags.map((t, i) => <span key={i} className="cb-tag">#{t.replace(/^#/, '')}</span>)}
      </div>
    )
  }
  if (type === 'list') {
    const items = parseListItems(value)
    if (!items.length) return null
    return (
      <ol className="cb-ol">
        {items.map((it, i) => <li key={i}><Linkified text={it} /></li>)}
      </ol>
    )
  }
  const paras = String(value || '').split(/\n{2,}/).filter((p) => p.trim())
  return (
    <div className="cb-richtext">
      {paras.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>{j > 0 && <br />}<Linkified text={line} /></Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

// Short single-line preview for the board card.
function cardPreview(card) {
  const s = card.sections || {}
  const fromPoints = parseListItems(s.main_points)[0]
  const fromHook = String(s.hook_script || '').split('\n').map((l) => l.trim()).find(Boolean)
  return fromHook || fromPoints || ''
}

function cardMatchesQuery(card, q) {
  if (!q) return true
  const s = card.sections || {}
  const haystack = [
    card.title,
    card.notes,
    s.hook_script, s.cta, s.thumbnail_idea,
    parseListItems(s.title_ideas).join(' '),
    parseListItems(s.main_points).join(' '),
    toTags(s.tags).join(' '),
    (s.labels || []).map((id) => LABEL_BY_ID[id]?.name).join(' '),
  ].join(' ').toLowerCase()
  return haystack.includes(q.toLowerCase())
}

// ─── Small shared bits ───────────────────────────────────────────────────────────

function CopyButton({ getText, title = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <button className={`cb-text-btn ${copied ? 'copied' : ''}`} onClick={copy} title={title}>
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  )
}

function LabelChips({ ids, size = 'sm' }) {
  const labels = (ids || []).map((id) => LABEL_BY_ID[id]).filter(Boolean)
  if (!labels.length) return null
  return (
    <div className={`cb-label-chips cb-label-chips--${size}`}>
      {labels.map((l) => (
        <span key={l.id} className="cb-label-chip" style={{ '--label': l.color }}>{l.name}</span>
      ))}
    </div>
  )
}

// ─── New Card Modal ──────────────────────────────────────────────────────────────

function NewCardModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [boardType, setBoardType] = useState('long_form')
  const [generateAI, setGenerateAI] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const card = await createContentCard({ title, boardType, generateAI })
      onCreated(card)
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="cb-modal-overlay" onClick={onClose}>
      <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cb-modal-header">
          <h3>New Content Card</h3>
          <button className="cb-icon-btn" onClick={onClose}><IconX /></button>
        </div>
        <form onSubmit={handleSubmit} className="cb-modal-form">
          <label className="cb-label">Video title or idea</label>
          <input
            ref={inputRef}
            className="cb-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How I Made My First $1000 Selling T-Shirts"
            required
          />
          <div className="cb-modal-row">
            <div className="cb-field">
              <label className="cb-label">Board</label>
              <div className="cb-radio-group">
                <label className={`cb-radio-option ${boardType === 'long_form' ? 'selected' : ''}`}>
                  <input type="radio" value="long_form" checked={boardType === 'long_form'} onChange={() => setBoardType('long_form')} />
                  Long Form
                </label>
                <label className={`cb-radio-option ${boardType === 'short_form' ? 'selected' : ''}`}>
                  <input type="radio" value="short_form" checked={boardType === 'short_form'} onChange={() => setBoardType('short_form')} />
                  Short Form
                </label>
              </div>
            </div>
            <label className={`cb-ai-toggle ${generateAI ? 'on' : ''}`}>
              <input type="checkbox" checked={generateAI} onChange={(e) => setGenerateAI(e.target.checked)} />
              <IconSparkle />
              Generate with AI
            </label>
          </div>
          {error && <div className="cb-error">{error}</div>}
          <div className="cb-modal-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>
              {saving ? (generateAI ? 'Generating…' : 'Creating…') : 'Create Card'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Published Date Modal ────────────────────────────────────────────────────────

function PublishedDateModal({ onConfirm, onSkip, onClose }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  return (
    <div className="cb-modal-overlay" onClick={onClose}>
      <div className="cb-modal cb-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="cb-modal-header">
          <h3>Published date?</h3>
          <button className="cb-icon-btn" onClick={onClose}><IconX /></button>
        </div>
        <div className="cb-modal-form">
          <label className="cb-label">When did this go live?</label>
          <input type="date" className="cb-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="cb-modal-actions">
            <button className="btn btn-primary" onClick={() => onConfirm(date)}>Save Date</button>
            <button className="btn btn-ghost" onClick={onSkip}>Skip</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card Detail (large centered modal, two columns) ─────────────────────────────

function CardDetail({ card, columns, onClose, onUpdate, onDelete, onMove }) {
  const colorOf = (id) => columns.find((c) => c.id === id)?.color || 'var(--accent)'
  const sectionDefs = card.board_type === 'long_form' ? LONG_FORM_SECTIONS : SHORT_FORM_SECTIONS

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(card.title)
  const [sections, setSections] = useState(card.sections || {})
  const [editingSection, setEditingSection] = useState(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [notes, setNotes] = useState(card.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(card.notes || '')
  const [newLink, setNewLink] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenField, setRegenField] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Keep local mirrors in sync if the card object changes underneath us.
  useEffect(() => { setSections(card.sections || {}); setNotes(card.notes || '') }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !editingSection && !editingTitle && !editingNotes) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingSection, editingTitle, editingNotes])

  const labels = sections.labels || []
  const links = sections.links || []

  async function persistSections(updated) {
    setSections(updated)
    await updateContentCard(card.id, { sections: updated })
    onUpdate({ ...card, sections: updated })
  }

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === card.title) { setEditingTitle(false); return }
    await updateContentCard(card.id, { title: titleDraft.trim() })
    onUpdate({ ...card, title: titleDraft.trim() })
    setEditingTitle(false)
  }

  async function saveSection(def) {
    const newVal = def.type === 'tags'
      ? sectionDraft.split(',').map((s) => s.trim()).filter(Boolean)
      : sectionDraft
    setEditingSection(null)
    await persistSections({ ...sections, [def.key]: newVal })
  }

  async function saveNotes() {
    setNotes(notesDraft)
    setEditingNotes(false)
    await updateContentCard(card.id, { notes: notesDraft })
    onUpdate({ ...card, notes: notesDraft })
  }

  function toggleLabel(id) {
    const next = labels.includes(id) ? labels.filter((l) => l !== id) : [...labels, id]
    persistSections({ ...sections, labels: next })
  }

  function addLink() {
    const url = newLink.trim()
    if (!url) return
    persistSections({ ...sections, links: [...links, url] })
    setNewLink('')
  }
  function removeLink(idx) {
    persistSections({ ...sections, links: links.filter((_, i) => i !== idx) })
  }

  async function handleRegenerate(field) {
    setRegenerating(true)
    setRegenField(field || null)
    try {
      const newSections = await regenerateCardSections(card.id, field)
      setSections(newSections)
      onUpdate({ ...card, sections: newSections })
    } catch {}
    setRegenerating(false)
    setRegenField(null)
  }

  async function handleDelete() {
    await deleteContentCard(card.id)
    onDelete(card.id)
    onClose()
  }

  function setPublished(value) {
    updateContentCard(card.id, { published_date: value || null })
    onUpdate({ ...card, published_date: value || null })
  }

  return (
    <div className="cb-detail-overlay" onClick={onClose}>
      <div className="cb-detail" style={{ '--col': colorOf(card.board_column) }} onClick={(e) => e.stopPropagation()}>
        <div className="cb-detail-accentbar" />
        <div className="cb-detail-header">
          {editingTitle ? (
            <div className="cb-detail-title-edit">
              <input
                className="cb-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={saveTitle}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTitle(false)}>Cancel</button>
            </div>
          ) : (
            <h2 className="cb-detail-title" onClick={() => { setTitleDraft(card.title); setEditingTitle(true) }} title="Click to edit">
              {card.title}
              <span className="cb-detail-edit-hint"><IconEdit /></span>
            </h2>
          )}
          <div className="cb-detail-header-actions">
            <CopyButton getText={() => card.title} title="Copy title" />
            <button className="btn btn-ghost btn-sm" onClick={() => handleRegenerate()} disabled={regenerating} title="Regenerate all sections with AI">
              <IconSparkle />
              {regenerating && !regenField ? 'Regenerating…' : 'Regenerate All'}
            </button>
            <button className="cb-icon-btn" onClick={onClose}><IconX /></button>
          </div>
        </div>

        <div className="cb-detail-grid">
          {/* ── Left: AI content sections ── */}
          <div className="cb-detail-main">
            {sectionDefs.map((def) => {
              const val = sections[def.key]
              const isEditing = editingSection === def.key
              const isRegenThis = regenerating && regenField === def.key
              const hasVal = def.type === 'tags' ? toTags(val).length : (def.type === 'list' ? parseListItems(val).length : String(val || '').trim())
              return (
                <div key={def.key} className="cb-section">
                  <div className="cb-section-head">
                    <span className="cb-section-label">{def.label}</span>
                    <div className="cb-section-actions">
                      {hasVal ? <CopyButton getText={() => sectionPlainText(def.type, val)} title={`Copy ${def.label.toLowerCase()}`} /> : null}
                      <button className="cb-text-btn" onClick={() => handleRegenerate(def.key)} disabled={regenerating} title={`Regenerate ${def.label}`}>
                        {isRegenThis ? '…' : <IconSparkle />}
                      </button>
                      {!isEditing && (
                        <button className="cb-text-btn" onClick={() => { setEditingSection(def.key); setSectionDraft(toEditText(def.type, val)) }} title={`Edit ${def.label}`}>
                          <IconEdit />
                        </button>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="cb-section-edit">
                      <textarea
                        className="cb-textarea"
                        value={sectionDraft}
                        onChange={(e) => setSectionDraft(e.target.value)}
                        rows={def.type === 'text' ? 5 : 4}
                        autoFocus
                        placeholder={def.type === 'list' ? 'One point per line…' : def.type === 'tags' ? 'comma, separated, tags' : ''}
                      />
                      <div className="cb-section-btns">
                        <button className="btn btn-primary btn-sm" onClick={() => saveSection(def)}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingSection(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`cb-section-body ${!hasVal ? 'empty' : ''}`}
                      onClick={() => { setEditingSection(def.key); setSectionDraft(toEditText(def.type, val)) }}
                    >
                      {hasVal ? <SectionValue type={def.type} value={val} /> : <span className="cb-placeholder">Click to add {def.label.toLowerCase()}…</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Right: status / labels / links / notes ── */}
          <div className="cb-detail-side">
            <div className="cb-side-block">
              <span className="cb-side-label">Status</span>
              <div className="cb-status-grid">
                {columns.map((c) => (
                  <button
                    key={c.id}
                    className={`cb-status-pill ${card.board_column === c.id ? 'active' : ''}`}
                    style={{ '--col': c.color }}
                    onClick={() => onMove(card, c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="cb-side-block">
              <span className="cb-side-label">Published date</span>
              <input
                type="date"
                className="cb-input cb-input--sm"
                value={card.published_date ? String(card.published_date).slice(0, 10) : ''}
                onChange={(e) => setPublished(e.target.value)}
              />
            </div>

            <div className="cb-side-block">
              <span className="cb-side-label">Labels</span>
              <div className="cb-label-picker">
                {LABELS.map((l) => (
                  <button
                    key={l.id}
                    className={`cb-label-opt ${labels.includes(l.id) ? 'on' : ''}`}
                    style={{ '--label': l.color }}
                    onClick={() => toggleLabel(l.id)}
                  >
                    {labels.includes(l.id) && <span className="cb-label-check"><IconCheck /></span>}
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="cb-side-block">
              <span className="cb-side-label">Links</span>
              {links.length > 0 && (
                <div className="cb-links-list">
                  {links.map((url, i) => {
                    const href = url.startsWith('http') ? url : `https://${url}`
                    let host = url
                    try { host = new URL(href).hostname.replace(/^www\./, '') + new URL(href).pathname.replace(/\/$/, '') } catch {}
                    return (
                      <div key={i} className="cb-link-row">
                        <a href={href} target="_blank" rel="noopener noreferrer" className="cb-link-item" title={url}>
                          <IconLink /><span>{host}</span>
                        </a>
                        <button className="cb-text-btn" onClick={() => removeLink(i)} title="Remove"><IconX /></button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="cb-link-add">
                <input
                  className="cb-input cb-input--sm"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                  placeholder="Paste a link + Enter"
                />
                <button className="cb-icon-btn cb-icon-btn--sm" onClick={addLink} title="Add link"><IconPlus /></button>
              </div>
            </div>

            <div className="cb-side-block">
              <div className="cb-section-head">
                <span className="cb-side-label">Notes</span>
                {!editingNotes && (
                  <button className="cb-text-btn" onClick={() => { setEditingNotes(true); setNotesDraft(notes) }}><IconEdit /></button>
                )}
              </div>
              {editingNotes ? (
                <div className="cb-section-edit">
                  <textarea
                    className="cb-textarea"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="Personal notes, references…"
                  />
                  <div className="cb-section-btns">
                    <button className="btn btn-primary btn-sm" onClick={saveNotes}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className={`cb-section-body ${!notes ? 'empty' : ''}`} onClick={() => { setEditingNotes(true); setNotesDraft(notes) }}>
                  {notes ? <SectionValue type="text" value={notes} /> : <span className="cb-placeholder">Click to add notes…</span>}
                </div>
              )}
            </div>

            <div className="cb-detail-footer">
              {confirmDelete ? (
                <div className="cb-delete-confirm">
                  <span>Delete this card?</span>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete}>Yes, delete</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm cb-delete-btn" onClick={() => setConfirmDelete(true)}>
                  <IconTrash /> Delete card
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────────

function KanbanCard({ card, color, columns, index, isDragging, onDragStart, onDragEnd, onDragOverCard, onClick, onMoveSelect }) {
  const preview = cardPreview(card)
  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const before = e.clientY < rect.top + rect.height / 2
    onDragOverCard(before ? index : index + 1)
  }
  return (
    <div
      className={`cb-card ${isDragging ? 'dragging' : ''}`}
      style={{ '--col': color }}
      draggable
      onDragStart={() => onDragStart(card)}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onClick={() => onClick(card)}
    >
      <span className="cb-card-grip"><IconGrip /></span>
      <LabelChips ids={card.sections?.labels} />
      <div className="cb-card-title">{card.title}</div>
      {preview && <div className="cb-card-preview">{preview}</div>}
      <div className="cb-card-foot">
        {card.published_date && <span className="cb-card-date">▸ {formatDate(card.published_date)}</span>}
        {card.sections?.links?.length > 0 && (
          <span className="cb-card-meta" title={`${card.sections.links.length} link(s)`}><IconLink /> {card.sections.links.length}</span>
        )}
      </div>
      {/* Mobile move select */}
      <div className="cb-card-move" onClick={(e) => e.stopPropagation()}>
        <select className="cb-move-select" value={card.board_column} onChange={(e) => onMoveSelect(card, e.target.value)}>
          {columns.map((col) => <option key={col.id} value={col.id}>{col.label}</option>)}
        </select>
      </div>
    </div>
  )
}

// ─── Quick add composer ──────────────────────────────────────────────────────────

function QuickAdd({ colId, onAdd }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => { if (open) ref.current?.focus() }, [open])

  async function submit() {
    const t = title.trim()
    if (!t) { setOpen(false); return }
    setSaving(true)
    try { await onAdd(colId, t); setTitle('') } catch {}
    setSaving(false)
    ref.current?.focus()
  }

  if (!open) {
    return (
      <button className="cb-add-card-btn" onClick={() => setOpen(true)}>
        <IconPlus /> Add card
      </button>
    )
  }
  return (
    <div className="cb-quickadd">
      <textarea
        ref={ref}
        className="cb-quickadd-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          if (e.key === 'Escape') { setOpen(false); setTitle('') }
        }}
        placeholder="Card title…"
        rows={2}
      />
      <div className="cb-quickadd-actions">
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving || !title.trim()}>Add</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setTitle('') }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Kanban Column ───────────────────────────────────────────────────────────────

function KanbanColumn({ col, cards, draggingCard, dragOver, onDragStart, onDragEnd, onDragOverCard, onDragOverColumn, onDrop, onCardClick, onQuickAdd, columns, onMoveCard }) {
  const isOver = draggingCard && dragOver?.colId === col.id

  function handleColumnDragOver(e) {
    e.preventDefault()
    onDragOverColumn(col.id, cards.length)
  }

  return (
    <div
      className={`cb-column ${isOver ? 'cb-column--over' : ''}`}
      style={{ '--col': col.color }}
      onDragOver={handleColumnDragOver}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      <div className="cb-column-header">
        <span className="cb-column-dot" />
        <span className="cb-column-label">{col.label}</span>
        <span className="cb-column-count">{cards.length}</span>
      </div>
      <div className="cb-column-cards">
        {cards.map((card, i) => (
          <Fragment key={card.id}>
            {isOver && dragOver?.index === i && <div className="cb-drop-line" />}
            <KanbanCard
              card={card}
              color={col.color}
              columns={columns}
              index={i}
              isDragging={draggingCard?.id === card.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverCard={(idx) => onDragOverCard(col.id, idx)}
              onClick={onCardClick}
              onMoveSelect={(c, colId) => onMoveCard(c, colId)}
            />
          </Fragment>
        ))}
        {isOver && dragOver?.index >= cards.length && <div className="cb-drop-line" />}
        <QuickAdd colId={col.id} onAdd={onQuickAdd} />
      </div>
    </div>
  )
}

// ─── Main ContentBoard ───────────────────────────────────────────────────────────

const byOrder = (a, b) =>
  ((a.position ?? 0) - (b.position ?? 0)) || (new Date(b.created_at || 0) - new Date(a.created_at || 0))

export default function ContentBoard() {
  const [boardType, setBoardType] = useState('long_form')
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewCard, setShowNewCard] = useState(false)
  const [selectedCard, setSelectedCard] = useState(null)
  const [draggingCard, setDraggingCard] = useState(null)
  const [dragOver, setDragOver] = useState(null) // { colId, index }
  const [publishedModal, setPublishedModal] = useState(null) // { card, targetColumn, targetIndex }
  const [search, setSearch] = useState('')

  const columns = boardType === 'long_form' ? LONG_FORM_COLUMNS : SHORT_FORM_COLUMNS

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCards(await fetchContentCards())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleCardCreated(card) {
    setCards((prev) => [card, ...prev])
    if (card.board_type !== boardType) setBoardType(card.board_type)
  }

  function handleCardUpdated(updated) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    if (selectedCard?.id === updated.id) setSelectedCard(updated)
  }

  function handleCardDeleted(id) {
    setCards((prev) => prev.filter((c) => c.id !== id))
    setSelectedCard(null)
  }

  async function quickAdd(colId, title) {
    const card = await createContentCard({ title, boardType, column: colId })
    setCards((prev) => [card, ...prev])
  }

  // Move a card into a column at a target index, reassigning positions and
  // persisting only the cards that actually changed.
  function reorderCard(dragged, targetColumn, targetIndex, publishedDate) {
    const bt = dragged.board_type
    const displayedTarget = cards
      .filter((c) => c.board_type === bt && c.board_column === targetColumn)
      .sort(byOrder)
    const targetList = displayedTarget.filter((c) => c.id !== dragged.id)
    const draggedIdx = displayedTarget.findIndex((c) => c.id === dragged.id)
    let idx = targetIndex
    if (draggedIdx !== -1 && draggedIdx < targetIndex) idx -= 1
    idx = Math.max(0, Math.min(idx, targetList.length))

    const moved = {
      ...dragged,
      board_column: targetColumn,
      ...(publishedDate ? { published_date: publishedDate } : {}),
    }
    targetList.splice(idx, 0, moved)

    const newPos = new Map(targetList.map((c, i) => [c.id, i]))
    const next = cards.map((c) => {
      if (c.id === dragged.id) return { ...moved, position: newPos.get(c.id) ?? 0 }
      if (newPos.has(c.id)) return { ...c, position: newPos.get(c.id) }
      return c
    })
    setCards(next)
    if (selectedCard?.id === dragged.id) setSelectedCard({ ...moved, position: newPos.get(dragged.id) ?? 0 })

    // Persist diffs
    const writes = []
    for (const c of targetList) {
      const before = cards.find((x) => x.id === c.id)
      const newPosition = newPos.get(c.id)
      const isDragged = c.id === dragged.id
      if (isDragged || before.position !== newPosition || before.board_column !== targetColumn) {
        writes.push(updateContentCard(c.id, {
          column: targetColumn,
          position: newPosition,
          ...(isDragged && publishedDate ? { published_date: publishedDate } : {}),
        }))
      }
    }
    Promise.all(writes).catch(() => load())
  }

  // Entry point for any move (drag-drop, mobile select, detail status pills).
  // Intercepts the published-date prompt before reordering.
  function requestMove(card, colId, index) {
    const targetIndex = index == null ? Infinity : index
    if (card.board_column === colId && index == null) return
    if (colId === 'published' && card.board_column !== 'published' && !card.published_date) {
      setPublishedModal({ card, targetColumn: colId, targetIndex })
      return
    }
    reorderCard(card, colId, targetIndex)
  }

  function handlePublishedConfirm(date) {
    const { card, targetColumn, targetIndex } = publishedModal
    setPublishedModal(null)
    reorderCard(card, targetColumn, targetIndex, date)
  }
  function handlePublishedSkip() {
    const { card, targetColumn, targetIndex } = publishedModal
    setPublishedModal(null)
    reorderCard(card, targetColumn, targetIndex)
  }

  function handleDragStart(card) { setDraggingCard(card) }
  function handleDragEnd() { setDraggingCard(null); setDragOver(null) }
  function handleDragOverCard(colId, index) {
    setDragOver((prev) => (prev && prev.colId === colId && prev.index === index ? prev : { colId, index }))
  }
  function handleDragOverColumn(colId, count) {
    setDragOver((prev) => (prev && prev.colId === colId ? prev : { colId, index: count }))
  }
  function handleDrop() {
    if (draggingCard && dragOver) {
      const { colId, index } = dragOver
      if (colId === 'published' && draggingCard.board_column !== 'published' && !draggingCard.published_date) {
        setPublishedModal({ card: draggingCard, targetColumn: colId, targetIndex: index })
      } else {
        reorderCard(draggingCard, colId, index)
      }
    }
    handleDragEnd()
  }

  const boardCards = cards
    .filter((c) => c.board_type === boardType)
    .filter((c) => cardMatchesQuery(c, search.trim()))

  return (
    <div className="content-board">
      <div className="page-header">
        <div className="page-header-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="2" width="4" height="12" rx="1" />
            <rect x="6" y="2" width="4" height="8" rx="1" />
            <rect x="11" y="2" width="4" height="10" rx="1" />
          </svg>
        </div>
        <div>
          <div className="page-header-title">Content Board</div>
          <div className="page-header-subtitle">YouTube video planning kanban</div>
        </div>
        <div className="page-header-right">
          <div className="cb-search">
            <IconSearch />
            <input
              className="cb-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards…"
            />
            {search && <button className="cb-search-clear" onClick={() => setSearch('')}><IconX /></button>}
          </div>
          <div className="cb-board-tabs">
            <button className={`cb-board-tab ${boardType === 'long_form' ? 'active' : ''}`} onClick={() => setBoardType('long_form')}>Long Form</button>
            <button className={`cb-board-tab ${boardType === 'short_form' ? 'active' : ''}`} onClick={() => setBoardType('short_form')}>Short Form</button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewCard(true)}>
            <IconPlus /> New Card
          </button>
        </div>
      </div>

      {loading && <div className="cb-loading"><div className="cb-spinner" /></div>}

      {!loading && error && (
        <div className="cb-error-wrap">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={load} style={{ marginTop: 12 }}>Try again</button>
        </div>
      )}

      {!loading && !error && (
        <div className="cb-board">
          {columns.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              cards={boardCards.filter((c) => c.board_column === col.id).sort(byOrder)}
              draggingCard={draggingCard}
              dragOver={dragOver}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOverCard={handleDragOverCard}
              onDragOverColumn={handleDragOverColumn}
              onDrop={handleDrop}
              onCardClick={setSelectedCard}
              onQuickAdd={quickAdd}
              columns={columns}
              onMoveCard={(c, colId) => requestMove(c, colId, null)}
            />
          ))}
        </div>
      )}

      {showNewCard && <NewCardModal onClose={() => setShowNewCard(false)} onCreated={handleCardCreated} />}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          columns={selectedCard.board_type === 'long_form' ? LONG_FORM_COLUMNS : SHORT_FORM_COLUMNS}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdated}
          onDelete={handleCardDeleted}
          onMove={(c, colId) => requestMove(c, colId, null)}
        />
      )}

      {publishedModal && (
        <PublishedDateModal
          onConfirm={handlePublishedConfirm}
          onSkip={handlePublishedSkip}
          onClose={() => setPublishedModal(null)}
        />
      )}
    </div>
  )
}
