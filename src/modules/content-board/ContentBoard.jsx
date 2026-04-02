import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchContentCards, createContentCard, updateContentCard,
  deleteContentCard, regenerateCardSections,
} from '../../services/api.js'
import './ContentBoard.css'

// ─── Column definitions ────────────────────────────────────────────────────────

const LONG_FORM_COLUMNS = [
  { id: 'idea', label: 'Idea' },
  { id: 'scripting', label: 'Scripting' },
  { id: 'ready_to_record', label: 'Ready to Record' },
  { id: 'recorded', label: 'Recorded' },
  { id: 'editing', label: 'Editing' },
  { id: 'published', label: 'Published' },
]

const SHORT_FORM_COLUMNS = [
  { id: 'idea', label: 'Idea' },
  { id: 'hook_written', label: 'Hook Written' },
  { id: 'ready_to_film', label: 'Ready to Film' },
  { id: 'published', label: 'Published' },
]

const LONG_FORM_SECTION_LABELS = {
  title_ideas: 'Title Ideas',
  hook_script: 'Hook Script',
  main_points: 'Main Points',
  cta: 'CTA',
  thumbnail_idea: 'Thumbnail Idea',
  tags: 'Tags',
}

const SHORT_FORM_SECTION_LABELS = {
  title_ideas: 'Title Ideas',
  hook_script: 'Hook Script',
  main_points: 'Main Points',
  cta: 'CTA',
  tags: 'Tags',
}

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function renderSectionValue(val) {
  if (Array.isArray(val)) return val.join(', ')
  return val || ''
}

// ─── New Card Modal ────────────────────────────────────────────────────────────

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

// ─── Published Date Modal ──────────────────────────────────────────────────────

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

// ─── Card Detail Panel ─────────────────────────────────────────────────────────

function CardDetail({ card, boardType, onClose, onUpdate, onDelete }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(card.title)
  const [sections, setSections] = useState(card.sections || {})
  const [editingSection, setEditingSection] = useState(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [notes, setNotes] = useState(card.notes || '')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(card.notes || '')
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [regenField, setRegenField] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const sectionLabels = boardType === 'long_form' ? LONG_FORM_SECTION_LABELS : SHORT_FORM_SECTION_LABELS

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === card.title) { setEditingTitle(false); return }
    setSaving(true)
    await updateContentCard(card.id, { title: titleDraft.trim() })
    onUpdate({ ...card, title: titleDraft.trim() })
    setSaving(false)
    setEditingTitle(false)
  }

  async function saveSection(key) {
    const updated = { ...sections, [key]: sectionDraft }
    setSections(updated)
    setEditingSection(null)
    await updateContentCard(card.id, { sections: updated })
    onUpdate({ ...card, sections: updated })
  }

  async function saveNotes() {
    setNotes(notesDraft)
    setEditingNotes(false)
    await updateContentCard(card.id, { notes: notesDraft })
    onUpdate({ ...card, notes: notesDraft })
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

  return (
    <div className="cb-detail-overlay" onClick={onClose}>
      <div className="cb-detail" onClick={(e) => e.stopPropagation()}>
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
              <button className="btn btn-primary btn-sm" onClick={saveTitle} disabled={saving}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTitle(false)}>Cancel</button>
            </div>
          ) : (
            <h2 className="cb-detail-title" onClick={() => setEditingTitle(true)} title="Click to edit">
              {card.title}
              <span className="cb-detail-edit-hint"><IconEdit /></span>
            </h2>
          )}
          <div className="cb-detail-header-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => handleRegenerate()}
              disabled={regenerating}
              title="Regenerate all sections with AI"
            >
              <IconRefresh />
              {regenerating && !regenField ? 'Regenerating…' : 'Regenerate All'}
            </button>
            <button className="cb-icon-btn" onClick={onClose}><IconX /></button>
          </div>
        </div>

        {card.published_date && (
          <div className="cb-detail-published">Published: {formatDate(card.published_date)}</div>
        )}

        <div className="cb-detail-body">
          {Object.entries(sectionLabels).map(([key, label]) => {
            const val = sections[key]
            const isEditing = editingSection === key
            const isRegenThis = regenerating && regenField === key
            return (
              <div key={key} className="cb-detail-section">
                <div className="cb-detail-section-header">
                  <span className="cb-detail-section-label">{label}</span>
                  <div className="cb-detail-section-actions">
                    <button
                      className="cb-text-btn"
                      onClick={() => handleRegenerate(key)}
                      disabled={regenerating}
                      title={`Regenerate ${label}`}
                    >
                      {isRegenThis ? '…' : <IconRefresh />}
                    </button>
                    {!isEditing && (
                      <button className="cb-text-btn" onClick={() => { setEditingSection(key); setSectionDraft(Array.isArray(val) ? val.join(', ') : (val || '')) }}>
                        <IconEdit />
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="cb-detail-section-edit">
                    <textarea
                      className="cb-notes-textarea"
                      value={sectionDraft}
                      onChange={(e) => setSectionDraft(e.target.value)}
                      rows={4}
                      autoFocus
                    />
                    <div className="cb-detail-section-btns">
                      <button className="btn btn-primary btn-sm" onClick={() => saveSection(key)}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingSection(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`cb-detail-section-content ${!val ? 'empty' : ''}`}
                    onClick={() => { setEditingSection(key); setSectionDraft(Array.isArray(val) ? val.join(', ') : (val || '')) }}
                  >
                    {val ? renderSectionValue(val) : <span className="cb-placeholder">Click to add {label.toLowerCase()}…</span>}
                  </div>
                )}
              </div>
            )
          })}

          <div className="cb-detail-section">
            <div className="cb-detail-section-header">
              <span className="cb-detail-section-label">Notes</span>
              {!editingNotes && (
                <button className="cb-text-btn" onClick={() => { setEditingNotes(true); setNotesDraft(notes) }}><IconEdit /></button>
              )}
            </div>
            {editingNotes ? (
              <div className="cb-detail-section-edit">
                <textarea
                  className="cb-notes-textarea"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Personal notes, links, references…"
                />
                <div className="cb-detail-section-btns">
                  <button className="btn btn-primary btn-sm" onClick={saveNotes}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className={`cb-detail-section-content ${!notes ? 'empty' : ''}`}
                onClick={() => { setEditingNotes(true); setNotesDraft(notes) }}
              >
                {notes || <span className="cb-placeholder">Click to add notes…</span>}
              </div>
            )}
          </div>
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
  )
}

// ─── Kanban Card ───────────────────────────────────────────────────────────────

function KanbanCard({ card, columns, onDragStart, onDragEnd, onClick, onMoveSelect }) {
  return (
    <div
      className="cb-card"
      draggable
      onDragStart={() => onDragStart(card)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(card)}
    >
      <div className="cb-card-title">{card.title}</div>
      {card.sections?.hook && (
        <div className="cb-card-hook">{card.sections.hook}</div>
      )}
      {card.published_date && (
        <div className="cb-card-date">Published {formatDate(card.published_date)}</div>
      )}
      {/* Mobile move select */}
      <div className="cb-card-move" onClick={(e) => e.stopPropagation()}>
        <select
          className="cb-move-select"
          value={card.board_column}
          onChange={(e) => onMoveSelect(card, e.target.value)}
        >
          {columns.map((col) => (
            <option key={col.id} value={col.id}>{col.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({ col, cards, draggingCard, onDragStart, onDragEnd, onDrop, onCardClick, onAddCard, columns, onMoveCard }) {
  const [over, setOver] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    setOver(true)
  }

  function handleDragLeave() {
    setOver(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setOver(false)
    onDrop(col.id)
  }

  return (
    <div
      className={`cb-column ${over && draggingCard ? 'cb-column--over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="cb-column-header">
        <span className="cb-column-label">{col.label}</span>
        <span className="cb-column-count">{cards.length}</span>
      </div>
      <div className="cb-column-cards">
        {cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            columns={columns}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
            onMoveSelect={(c, colId) => onMoveCard(c, colId)}
          />
        ))}
        <button className="cb-add-card-btn" onClick={() => onAddCard(col.id)}>
          <IconPlus /> Add card
        </button>
      </div>
    </div>
  )
}

// ─── Main ContentBoard ─────────────────────────────────────────────────────────

export default function ContentBoard() {
  const [boardType, setBoardType] = useState('long_form')
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewCard, setShowNewCard] = useState(false)
  const [selectedCard, setSelectedCard] = useState(null)
  const [draggingCard, setDraggingCard] = useState(null)
  const [publishedModal, setPublishedModal] = useState(null) // { card, targetColumn }

  const columns = boardType === 'long_form' ? LONG_FORM_COLUMNS : SHORT_FORM_COLUMNS

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchContentCards()
      setCards(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleCardCreated(card) {
    setCards((prev) => [card, ...prev])
    // If board type differs from current view, switch to it
    if (card.board_type !== boardType) setBoardType(card.board_type)
  }

  function handleCardUpdated(updated) {
    setCards((prev) => prev.map((c) => c.id === updated.id ? updated : c))
    if (selectedCard?.id === updated.id) setSelectedCard(updated)
  }

  function handleCardDeleted(id) {
    setCards((prev) => prev.filter((c) => c.id !== id))
    setSelectedCard(null)
  }

  async function moveCard(card, targetColumn) {
    if (card.board_column === targetColumn) return

    if (targetColumn === 'published' && !card.published_date) {
      setPublishedModal({ card, targetColumn })
      return
    }

    setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: targetColumn } : c))
    try {
      await updateContentCard(card.id, { column: targetColumn })
    } catch {
      // Revert on error
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: card.board_column } : c))
    }
  }

  async function handlePublishedConfirm(date) {
    const { card, targetColumn } = publishedModal
    setPublishedModal(null)
    setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: targetColumn, published_date: date } : c))
    try {
      await updateContentCard(card.id, { column: targetColumn, published_date: date })
    } catch {
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: card.board_column } : c))
    }
  }

  async function handlePublishedSkip() {
    const { card, targetColumn } = publishedModal
    setPublishedModal(null)
    setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: targetColumn } : c))
    try {
      await updateContentCard(card.id, { column: targetColumn })
    } catch {
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, board_column: card.board_column } : c))
    }
  }

  function handleDragStart(card) {
    setDraggingCard(card)
  }

  function handleDragEnd() {
    setDraggingCard(null)
  }

  function handleDrop(colId) {
    if (!draggingCard) return
    moveCard(draggingCard, colId)
    setDraggingCard(null)
  }

  const boardCards = cards.filter((c) => c.board_type === boardType)

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
          <div className="cb-board-tabs">
            <button
              className={`cb-board-tab ${boardType === 'long_form' ? 'active' : ''}`}
              onClick={() => setBoardType('long_form')}
            >
              Long Form
            </button>
            <button
              className={`cb-board-tab ${boardType === 'short_form' ? 'active' : ''}`}
              onClick={() => setBoardType('short_form')}
            >
              Short Form
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewCard(true)}>
            <IconPlus /> New Card
          </button>
        </div>
      </div>

      {loading && (
        <div className="cb-loading">
          <div className="cb-spinner" />
        </div>
      )}

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
              cards={boardCards.filter((c) => c.board_column === col.id)}
              draggingCard={draggingCard}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={handleDrop}
              onCardClick={setSelectedCard}
              onAddCard={() => setShowNewCard(true)}
              columns={columns}
              onMoveCard={moveCard}
            />
          ))}
        </div>
      )}

      {showNewCard && (
        <NewCardModal
          onClose={() => setShowNewCard(false)}
          onCreated={handleCardCreated}
        />
      )}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          boardType={selectedCard.board_type}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleCardUpdated}
          onDelete={handleCardDeleted}
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
