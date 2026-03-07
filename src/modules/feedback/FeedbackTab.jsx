import { useState, useEffect, useCallback } from 'react'
import { fetchFeedback, updateFeedbackNotes } from '../../services/api.js'
import './FeedbackTab.css'

const CATEGORY_LABELS = {
  student_support: 'Student Support',
  sponsorship: 'Sponsorship',
  general: 'Spam',
}

const CATEGORY_CLASS = {
  student_support: 'fb-badge fb-badge--support',
  sponsorship: 'fb-badge fb-badge--sponsorship',
  general: 'fb-badge fb-badge--general',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
)

function DraftDiff({ original, final }) {
  const [show, setShow] = useState(false)
  return (
    <div className="fb-diff-wrap">
      <button className="fb-diff-toggle" onClick={() => setShow((v) => !v)}>
        {show ? 'Hide drafts ▲' : 'View drafts ▼'}
      </button>
      {show && (
        <div className="fb-diff-panels">
          <div className="fb-diff-panel fb-diff-panel--original">
            <div className="fb-diff-label">AI draft</div>
            <pre className="fb-diff-text">{original}</pre>
          </div>
          <div className="fb-diff-panel fb-diff-panel--final">
            <div className="fb-diff-label">Kerry's version</div>
            <pre className="fb-diff-text">{final}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function NotesCell({ entry, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(entry.notes || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(entry.id, value)
      setEditing(false)
    } catch {}
    setSaving(false)
  }

  if (editing) {
    return (
      <div className="fb-notes-edit">
        <textarea
          className="fb-notes-textarea"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Add notes or corrections…"
        />
        <div className="fb-notes-edit-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost" onClick={() => { setEditing(false); setValue(entry.notes || '') }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fb-notes-view" onClick={() => setEditing(true)} title="Click to edit">
      {value ? <span className="fb-notes-text">{value}</span> : <span className="fb-notes-placeholder">+ Add note</span>}
    </div>
  )
}

export default function FeedbackTab() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchFeedback()
      setEntries(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSaveNotes(id, notes) {
    await updateFeedbackNotes(id, notes)
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, notes } : e))
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.category === filter)

  return (
    <div className="feedback-tab">
      <div className="page-header">
        <div className="page-header-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1v14M1 8h14M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </div>
        <div>
          <div className="page-header-title">AI Feedback</div>
          <div className="page-header-subtitle">Draft edits logged for AI improvement</div>
        </div>
        <div className="page-header-right">
          <select
            className="fb-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            <option value="student_support">Student Support</option>
            <option value="sponsorship">Sponsorship</option>
            <option value="general">Spam</option>
          </select>
          <button className="btn btn-ghost" onClick={load} disabled={loading} title="Refresh">
            <IconRefresh />
            Refresh
          </button>
        </div>
      </div>

      <div className="feedback-body">
        {loading && (
          <div className="fb-loading">
            <div className="fb-spinner" />
          </div>
        )}

        {!loading && error && (
          <div className="fb-error">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={load} style={{ marginTop: 12 }}>Try again</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="fb-empty">
            {entries.length === 0
              ? 'No feedback logged yet. When you edit an AI draft before sending, the changes are recorded here.'
              : 'No entries for this category.'}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="fb-table-wrap">
            <table className="fb-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Changes</th>
                  <th>Drafts</th>
                  <th>Notes / Corrections</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id}>
                    <td className="fb-td-date">{formatDate(entry.created_at)}</td>
                    <td>
                      <span className={CATEGORY_CLASS[entry.category] || 'fb-badge'}>
                        {CATEGORY_LABELS[entry.category] || entry.category}
                      </span>
                    </td>
                    <td className="fb-td-diff">{entry.diff_summary || '—'}</td>
                    <td>
                      <DraftDiff original={entry.original_draft} final={entry.final_version} />
                    </td>
                    <td>
                      <NotesCell entry={entry} onSave={handleSaveNotes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
