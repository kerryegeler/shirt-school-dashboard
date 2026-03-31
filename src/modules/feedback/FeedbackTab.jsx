import { useState, useEffect, useCallback } from 'react'
import { fetchFeedback, updateFeedbackNotes, fetchLearnedBehaviors, saveLearnedBehaviors, triggerLearningRebuild } from '../../services/api.js'
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

const ACTION_LABELS = { approved: '✅ Approved', edited: '✏️ Edited', skipped: '⏭️ Skipped' }
const ACTION_CLASS  = { approved: 'fb-action fb-action--approved', edited: 'fb-action fb-action--edited', skipped: 'fb-action fb-action--skipped' }

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

function DraftDiff({ original, final, action }) {
  const [show, setShow] = useState(false)
  const isEdited = action === 'edited'
  return (
    <div className="fb-diff-wrap">
      <button className="fb-diff-toggle" onClick={() => setShow((v) => !v)}>
        {show ? 'Hide draft ▲' : 'View draft ▼'}
      </button>
      {show && (
        <div className={isEdited ? 'fb-diff-panels' : 'fb-diff-single'}>
          <div className="fb-diff-panel fb-diff-panel--original">
            <div className="fb-diff-label">AI draft</div>
            <pre className="fb-diff-text">{original}</pre>
          </div>
          {isEdited && (
            <div className="fb-diff-panel fb-diff-panel--final">
              <div className="fb-diff-label">Kerry's version</div>
              <pre className="fb-diff-text">{final}</pre>
            </div>
          )}
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
  const [actionFilter, setActionFilter] = useState('all')

  // Learned behaviors state
  const [learnedContent, setLearnedContent] = useState('')
  const [learnedLastUpdated, setLearnedLastUpdated] = useState(null)
  const [loadingLearned, setLoadingLearned] = useState(true)
  const [editingLearned, setEditingLearned] = useState(false)
  const [learnedDraft, setLearnedDraft] = useState('')
  const [savingLearned, setSavingLearned] = useState(false)
  const [learnedError, setLearnedError] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildMsg, setRebuildMsg] = useState('')

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

  const loadLearned = useCallback(async () => {
    setLoadingLearned(true)
    try {
      const d = await fetchLearnedBehaviors()
      setLearnedContent(d.content || '')
      setLearnedLastUpdated(d.lastUpdated)
      setLearnedDraft(d.content || '')
    } catch {}
    setLoadingLearned(false)
  }, [])

  useEffect(() => { load(); loadLearned() }, [load, loadLearned])

  async function handleRebuildLearning() {
    setRebuilding(true)
    setRebuildMsg('')
    try {
      await triggerLearningRebuild()
      setRebuildMsg('Rebuilding… check back in a few seconds.')
      setTimeout(async () => {
        await loadLearned()
        setRebuildMsg('')
        setRebuilding(false)
      }, 4000)
    } catch (err) {
      setRebuildMsg(`Error: ${err.message}`)
      setRebuilding(false)
    }
  }

  async function handleSaveLearned() {
    setSavingLearned(true)
    setLearnedError('')
    try {
      await saveLearnedBehaviors(learnedDraft)
      setLearnedContent(learnedDraft)
      setEditingLearned(false)
    } catch (err) {
      setLearnedError(err.message)
    }
    setSavingLearned(false)
  }

  async function handleSaveNotes(id, notes) {
    await updateFeedbackNotes(id, notes)
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, notes } : e))
  }

  const filtered = entries
    .filter((e) => filter === 'all' || e.category === filter)
    .filter((e) => actionFilter === 'all' || (e.action || 'edited') === actionFilter)

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
          <select className="fb-filter-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">All actions</option>
            <option value="approved">✅ Approved</option>
            <option value="edited">✏️ Edited</option>
            <option value="skipped">⏭️ Skipped</option>
          </select>
          <select className="fb-filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
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
                  <th>Action</th>
                  <th>Category</th>
                  <th>Changes</th>
                  <th>Draft</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const action = entry.action || 'edited'
                  return (
                    <tr key={entry.id}>
                      <td className="fb-td-date" data-label="Date">{formatDate(entry.created_at)}</td>
                      <td data-label="Action">
                        <span className={ACTION_CLASS[action] || 'fb-action'}>
                          {ACTION_LABELS[action] || action}
                        </span>
                      </td>
                      <td data-label="Category">
                        <span className={CATEGORY_CLASS[entry.category] || 'fb-badge'}>
                          {CATEGORY_LABELS[entry.category] || entry.category}
                        </span>
                      </td>
                      <td className="fb-td-diff" data-label="Changes">
                        {action === 'edited' ? (entry.diff_summary || '—') : '—'}
                      </td>
                      <td data-label="Draft">
                        <DraftDiff original={entry.original_draft} final={entry.final_version} action={action} />
                      </td>
                      <td data-label="Notes">
                        <NotesCell entry={entry} onSave={handleSaveNotes} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── What the Agent Has Learned ─── */}
      <div className="fb-learned-wrap">
        <div className="fb-learned-header">
          <div className="fb-learned-title-row">
            <h3 className="fb-learned-title">What the Agent Has Learned</h3>
            {learnedLastUpdated && !isNaN(new Date(learnedLastUpdated).getTime()) && (
              <span className="fb-learned-timestamp">
                Last learned: {new Date(learnedLastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {rebuildMsg && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{rebuildMsg}</span>}
            <button className="btn btn-ghost" onClick={loadLearned} disabled={loadingLearned} title="Refresh">
              <IconRefresh />
            </button>
            <button className="btn btn-secondary" onClick={handleRebuildLearning} disabled={rebuilding} title="Re-process all feedback entries now">
              {rebuilding ? 'Rebuilding…' : 'Rebuild Now'}
            </button>
            {!editingLearned && (
              <button className="btn btn-ghost" onClick={() => { setEditingLearned(true); setLearnedDraft(learnedContent) }}>
                Edit
              </button>
            )}
          </div>
        </div>

        {loadingLearned ? (
          <div className="fb-spinner" style={{ margin: '24px auto' }} />
        ) : editingLearned ? (
          <div className="fb-learned-edit">
            <textarea
              className="fb-learned-textarea"
              value={learnedDraft}
              onChange={(e) => setLearnedDraft(e.target.value)}
              rows={24}
              spellCheck={false}
            />
            {learnedError && <div className="fb-error" style={{ marginTop: 8 }}>{learnedError}</div>}
            <div className="fb-learned-edit-actions">
              <button className="btn btn-primary" onClick={handleSaveLearned} disabled={savingLearned}>
                {savingLearned ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setEditingLearned(false); setLearnedDraft(learnedContent) }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <pre className="fb-learned-content">{learnedContent || 'No learned behaviors yet. Edit and send emails to start building the learning file.'}</pre>
        )}
      </div>
    </div>
  )
}
