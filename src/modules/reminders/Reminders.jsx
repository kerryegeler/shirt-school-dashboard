import { useState, useEffect, useCallback } from 'react'
import {
  fetchReminders, createReminder, updateReminder, deleteReminder,
} from '../../services/api.js'
import './Reminders.css'

function chicagoToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function formatDue(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(iso) {
  const today = new Date(chicagoToday() + 'T00:00:00')
  const due = new Date(iso + 'T00:00:00')
  return Math.round((due - today) / (24 * 60 * 60 * 1000))
}

function dueBadge(iso) {
  const d = daysUntil(iso)
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, cls: 'rem-due--overdue' }
  if (d === 0) return { label: 'Due today', cls: 'rem-due--today' }
  if (d === 1) return { label: 'Due tomorrow', cls: 'rem-due--soon' }
  if (d <= 7) return { label: `In ${d} days`, cls: 'rem-due--soon' }
  return { label: `In ${d} days`, cls: 'rem-due--later' }
}

export default function Reminders() {
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')

  // Add form
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState(chicagoToday())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchReminders(showDone)
      setReminders(data)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [showDone])

  useEffect(() => { load() }, [load])

  async function handleAdd(e) {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    setSaving(true)
    try {
      await createReminder({ title: title.trim(), notes: notes.trim(), due_date: dueDate })
      setTitle(''); setNotes(''); setDueDate(chicagoToday())
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleDone(r) {
    await updateReminder(r.id, { status: r.status === 'done' ? 'pending' : 'done' }).catch(() => {})
    await load()
  }

  async function handleDelete(r) {
    if (!confirm(`Delete reminder "${r.title}"?`)) return
    await deleteReminder(r.id).catch(() => {})
    await load()
  }

  const pending = reminders.filter((r) => r.status !== 'done')
  const done = reminders.filter((r) => r.status === 'done')

  return (
    <div className="reminders">
      <div className="page-header">
        <div className="page-header-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="9" r="6" />
            <path d="M8 6v3l2 1.5" />
            <path d="M6 1h4" />
          </svg>
        </div>
        <div>
          <div className="page-header-title">Reminders</div>
          <div className="page-header-subtitle">Business tasks — get pinged in Slack when due</div>
        </div>
      </div>

      <div className="rem-content">
        {/* Add form */}
        <form className="rem-add-card" onSubmit={handleAdd}>
          <div className="rem-add-title">New Reminder</div>
          <input
            className="rem-input"
            placeholder="What needs to be done? (e.g. Cancel John's subscription after 5th payment)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="rem-textarea"
            placeholder="Notes (optional) — context, account details, links…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <div className="rem-add-row">
            <div className="rem-field">
              <label className="rem-label">Remind me on</label>
              <input
                className="rem-input rem-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving || !title.trim()}>
              {saving ? 'Adding…' : '+ Add Reminder'}
            </button>
          </div>
        </form>

        {error && <div className="rem-error">{error}</div>}
        {loading && <div className="rem-loading"><div className="rem-spinner" /></div>}

        {!loading && (
          <>
            <div className="rem-section-head">
              <span>Upcoming ({pending.length})</span>
            </div>
            {pending.length === 0 && (
              <div className="rem-empty">No upcoming reminders. Add one above.</div>
            )}
            <div className="rem-list">
              {pending.map((r) => {
                const badge = dueBadge(r.due_date)
                return (
                  <div key={r.id} className="rem-item">
                    <button className="rem-check" onClick={() => handleDone(r)} title="Mark done">
                      <span className="rem-check-box" />
                    </button>
                    <div className="rem-item-body">
                      <div className="rem-item-title">{r.title}</div>
                      {r.notes && <div className="rem-item-notes">{r.notes}</div>}
                      <div className="rem-item-meta">
                        <span className={`rem-due ${badge.cls}`}>{badge.label}</span>
                        <span className="rem-item-date">{formatDue(r.due_date)}</span>
                        {r.notified_at && <span className="rem-notified">🔔 Slack alert sent</span>}
                      </div>
                    </div>
                    <button className="rem-del" onClick={() => handleDelete(r)} title="Delete">✕</button>
                  </div>
                )
              })}
            </div>

            <div className="rem-section-head rem-section-head--toggle" onClick={() => setShowDone((v) => !v)}>
              <span>Completed</span>
              <span className="rem-toggle">{showDone ? 'Hide' : 'Show'}</span>
            </div>
            {showDone && (
              <div className="rem-list">
                {done.length === 0 && <div className="rem-empty">Nothing completed yet.</div>}
                {done.map((r) => (
                  <div key={r.id} className="rem-item rem-item--done">
                    <button className="rem-check rem-check--done" onClick={() => handleDone(r)} title="Reopen">
                      <span className="rem-check-box">✓</span>
                    </button>
                    <div className="rem-item-body">
                      <div className="rem-item-title">{r.title}</div>
                      <div className="rem-item-meta">
                        <span className="rem-item-date">{formatDue(r.due_date)}</span>
                      </div>
                    </div>
                    <button className="rem-del" onClick={() => handleDelete(r)} title="Delete">✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
