import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchChallenges, createChallenge, launchChallenge, deleteChallenge, fetchChallenge,
  fetchChallengeTemplates, createChallengeTemplate, updateChallengeTemplate, deleteChallengeTemplate,
  reorderChallengeTemplates, fetchKitBroadcastsForImport, importChallengeTemplatesFromKit,
} from '../../services/api.js'
import './ChallengeLauncher.css'

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconRocket = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3c1-1.5 3.5-2.5 4-2 .5.5-.5 3-2 4L8 8 5 11l-2 .5.5-2L6 7l3-4z" />
    <circle cx="10" cy="6" r="1" fill="currentColor" stroke="none" />
    <path d="M5 11c-1 1-1.5 2.5-1 3 .5.5 2-0 3-1" />
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

const IconChevron = ({ open }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <path d="M4 6l4 4 4-4" />
  </svg>
)

const IconUp = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10l4-4 4 4" />
  </svg>
)

const IconDown = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l4 4 4-4" />
  </svg>
)

const IconCopy = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2H3.5A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relDayLabel(n) {
  if (n === 0) return 'Day of start'
  if (n > 0) return `Day ${n}`
  return `${Math.abs(n)} days before`
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${ap}`
}

const TOKENS = [
  '{{ZOOM_WEBINAR_LINK}}', '{{ZOOM_VIP_LINK}}', '{{CHALLENGE_NAME}}',
  '{{DAY_1_DATE}}', '{{DAY_2_DATE}}', '{{DAY_3_DATE}}', '{{DAY_4_DATE}}', '{{DAY_5_DATE}}',
  '{{MAIN_SESSION_TIME}}', '{{VIP_SESSION_TIME}}',
]

const TIMEZONES = [
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
]

const STATUS_LABELS = { draft: 'Draft', launching: 'Launching…', launched: 'Launched', failed: 'Failed' }
const STATUS_CLASS  = { draft: 'cl-status cl-status--draft', launching: 'cl-status cl-status--launching', launched: 'cl-status cl-status--launched', failed: 'cl-status cl-status--failed' }

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmLaunchModal({ challenge, templateCount, onConfirm, onCancel }) {
  const [testMode, setTestMode] = useState(false)
  return (
    <div className="cl-modal-overlay" onClick={onCancel}>
      <div className="cl-modal" onClick={e => e.stopPropagation()}>
        <h3 className="cl-modal-title">Launch Challenge</h3>
        <p className="cl-modal-body">
          You are about to launch <strong>{challenge.name}</strong>. This will:
        </p>
        <ul className="cl-modal-list">
          <li>Create 1 Kit tag</li>
          <li>Create 1 recurring Zoom webinar (5 sessions)</li>
          <li>Create 1 recurring Zoom meeting for VIP (5 sessions)</li>
          <li>Schedule {templateCount} emails in Kit</li>
        </ul>
        <label className="cl-modal-test">
          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
          <span><strong>Test Mode</strong> — create everything but schedule emails as drafts (review in Kit before sending)</span>
        </label>
        <div className="cl-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onConfirm(testMode)}>
            {testMode ? 'Launch (Test Mode)' : 'Launch Now'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Launch Tab ───────────────────────────────────────────────────────────────

function LaunchTab({ challenges, templates, onChallengesChange }) {
  const [form, setForm] = useState({
    name: '', startDate: '', mainSessionTime: '20:00', vipSessionTime: '21:30',
    timezone: 'America/Chicago',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [confirmChallenge, setConfirmChallenge] = useState(null)
  const [launchingId, setLaunchingId] = useState(null)
  const [launchStep, setLaunchStep] = useState('')
  const pollRef = useRef(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.startDate) return
    setCreating(true); setCreateError('')
    try {
      const ch = await createChallenge(form)
      onChallengesChange(prev => [ch, ...prev])
      setForm({ name: '', startDate: '', mainSessionTime: '20:00', vipSessionTime: '21:30', timezone: 'America/Chicago' })
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function handleLaunchClick(challenge) {
    setConfirmChallenge(challenge)
  }

  async function handleLaunchConfirm(testMode) {
    const ch = confirmChallenge
    setConfirmChallenge(null)
    setLaunchingId(ch.id)
    setLaunchStep('Sending launch request…')
    try {
      await launchChallenge(ch.id, testMode)
      onChallengesChange(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'launching' } : c))
      // Poll for status updates
      pollRef.current = setInterval(async () => {
        try {
          const updated = await fetchChallenge(ch.id)
          onChallengesChange(prev => prev.map(c => c.id === ch.id ? updated : c))
          if (updated.status === 'launched' || updated.status === 'failed') {
            stopPolling()
            setLaunchingId(null)
            setLaunchStep('')
          } else {
            setLaunchStep(updated.emails_scheduled > 0 ? `Scheduling emails (${updated.emails_scheduled}/${templates.length})…` : 'Creating Zoom & Kit…')
          }
        } catch {}
      }, 2500)
    } catch (err) {
      setLaunchingId(null)
      setLaunchStep('')
      onChallengesChange(prev => prev.map(c => c.id === ch.id ? { ...c, status: 'failed', error_log: err.message } : c))
    }
  }

  async function handleDelete(ch) {
    if (!window.confirm(`Delete draft challenge "${ch.name}"?`)) return
    try {
      await deleteChallenge(ch.id)
      onChallengesChange(prev => prev.filter(c => c.id !== ch.id))
    } catch (err) {
      alert(err.message)
    }
  }

  const draftChallenges = challenges.filter(c => c.status === 'draft' || c.status === 'failed')
  const launchedChallenges = challenges.filter(c => c.status === 'launched' || c.status === 'launching')

  return (
    <div className="cl-launch-tab">
      {confirmChallenge && (
        <ConfirmLaunchModal
          challenge={confirmChallenge}
          templateCount={templates.length}
          onConfirm={handleLaunchConfirm}
          onCancel={() => setConfirmChallenge(null)}
        />
      )}

      <div className="cl-card">
        <div className="cl-card-title">New Challenge</div>
        <form className="cl-form" onSubmit={handleCreate}>
          <div className="cl-form-row">
            <label className="cl-label">Challenge Name</label>
            <input
              className="cl-input"
              placeholder="e.g. June 2026 Challenge"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="cl-form-row">
            <label className="cl-label">Start Date</label>
            <input
              className="cl-input"
              type="date"
              value={form.startDate}
              onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
              required
            />
          </div>
          <div className="cl-form-cols">
            <div className="cl-form-row">
              <label className="cl-label">Main Session Time</label>
              <input
                className="cl-input"
                type="time"
                value={form.mainSessionTime}
                onChange={e => setForm(p => ({ ...p, mainSessionTime: e.target.value }))}
              />
            </div>
            <div className="cl-form-row">
              <label className="cl-label">VIP Session Time</label>
              <input
                className="cl-input"
                type="time"
                value={form.vipSessionTime}
                onChange={e => setForm(p => ({ ...p, vipSessionTime: e.target.value }))}
              />
            </div>
          </div>
          <div className="cl-form-row">
            <label className="cl-label">Timezone</label>
            <select className="cl-input" value={form.timezone} onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}>
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
          {createError && <div className="cl-error">{createError}</div>}
          <button className="btn btn-primary" type="submit" disabled={creating || !form.name.trim() || !form.startDate}>
            {creating ? 'Creating…' : 'Create Challenge'}
          </button>
        </form>
      </div>

      {draftChallenges.length > 0 && (
        <div className="cl-card">
          <div className="cl-card-title">Ready to Launch</div>
          <div className="cl-challenge-list">
            {draftChallenges.map(ch => (
              <div key={ch.id} className="cl-challenge-row">
                <div className="cl-challenge-info">
                  <span className="cl-challenge-name">{ch.name}</span>
                  <span className="cl-challenge-meta">{fmtDate(ch.start_date)}</span>
                  <span className={STATUS_CLASS[ch.status] || 'cl-status'}>{STATUS_LABELS[ch.status] || ch.status}</span>
                </div>
                {ch.error_log && <div className="cl-error cl-error--inline">{ch.error_log}</div>}
                <div className="cl-challenge-actions">
                  {launchingId === ch.id ? (
                    <span className="cl-launch-step">{launchStep}</span>
                  ) : (
                    <button className="btn btn-primary" onClick={() => handleLaunchClick(ch)} disabled={!!launchingId}>
                      Launch
                    </button>
                  )}
                  <button className="cl-icon-btn" title="Delete" onClick={() => handleDelete(ch)} disabled={!!launchingId}>
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {launchedChallenges.length > 0 && (
        <div className="cl-card">
          <div className="cl-card-title">Active Challenges</div>
          <div className="cl-challenge-list">
            {launchedChallenges.map(ch => (
              <div key={ch.id} className="cl-challenge-row cl-challenge-row--launched">
                <div className="cl-challenge-info">
                  <span className="cl-challenge-name">{ch.name}</span>
                  <span className="cl-challenge-meta">{fmtDate(ch.start_date)}</span>
                  <span className={STATUS_CLASS[ch.status] || 'cl-status'}>{STATUS_LABELS[ch.status] || ch.status}</span>
                  {ch.emails_scheduled > 0 && <span className="cl-challenge-meta">{ch.emails_scheduled} emails</span>}
                </div>
                {ch.status === 'launching' && launchingId === ch.id && (
                  <span className="cl-launch-step">{launchStep}</span>
                )}
                {ch.zoom_webinar_join_url && (
                  <div className="cl-links">
                    <a href={ch.zoom_webinar_join_url} target="_blank" rel="noreferrer" className="cl-link">Main Zoom Link</a>
                    {ch.zoom_meeting_join_url && <a href={ch.zoom_meeting_join_url} target="_blank" rel="noreferrer" className="cl-link">VIP Zoom Link</a>}
                    {ch.kit_tag_name && <span className="cl-link-tag">Kit tag: {ch.kit_tag_name}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {challenges.length === 0 && (
        <div className="cl-empty">Create your first challenge above to get started.</div>
      )}
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab({ templates, onTemplatesChange }) {
  const [expandedId, setExpandedId] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newTemplate, setNewTemplate] = useState({ subject: '', body_html: '', relative_day: 0, send_time: '08:00', description: '' })
  const [addError, setAddError] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importBroadcasts, setImportBroadcasts] = useState([])
  const [importLoading, setImportLoading] = useState(false)
  const [importSelected, setImportSelected] = useState(new Set())
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  async function handleSaveEdit() {
    if (!editingTemplate) return
    setSaving(true)
    try {
      const updated = await updateChallengeTemplate(editingTemplate.id, editingTemplate)
      onTemplatesChange(prev => prev.map(t => t.id === updated.id ? updated : t))
      setExpandedId(null)
      setEditingTemplate(null)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this template?')) return
    try {
      await deleteChallengeTemplate(id)
      onTemplatesChange(prev => prev.filter(t => t.id !== id))
      if (expandedId === id) { setExpandedId(null); setEditingTemplate(null) }
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newTemplate.subject.trim()) return
    setSaving(true); setAddError('')
    try {
      const maxOrder = templates.reduce((m, t) => Math.max(m, t.sort_order), 0)
      const created = await createChallengeTemplate({ ...newTemplate, sort_order: maxOrder + 1 })
      onTemplatesChange(prev => [...prev, created])
      setAddingNew(false)
      setNewTemplate({ subject: '', body_html: '', relative_day: 0, send_time: '08:00', description: '' })
    } catch (err) {
      setAddError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleMove(index, dir) {
    const newList = [...templates]
    const swapIdx = index + dir
    if (swapIdx < 0 || swapIdx >= newList.length) return
    ;[newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]]
    const reordered = newList.map((t, i) => ({ ...t, sort_order: i + 1 }))
    onTemplatesChange(reordered)
    await reorderChallengeTemplates(reordered.map(({ id, sort_order }) => ({ id, sort_order }))).catch(() => {})
  }

  async function openImportModal() {
    setShowImportModal(true)
    setImportLoading(true)
    setImportError('')
    try {
      const broadcasts = await fetchKitBroadcastsForImport()
      setImportBroadcasts(broadcasts)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  async function handleImport() {
    if (!importSelected.size) return
    setImporting(true)
    try {
      const result = await importChallengeTemplatesFromKit([...importSelected])
      onTemplatesChange(prev => [...prev, ...result.templates])
      setShowImportModal(false)
      setImportSelected(new Set())
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="cl-templates-tab">
      {showImportModal && (
        <div className="cl-modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="cl-modal cl-modal--wide" onClick={e => e.stopPropagation()}>
            <h3 className="cl-modal-title">Import from Kit</h3>
            {importLoading && <div className="cl-spinner-wrap"><div className="cl-spinner" /></div>}
            {importError && <div className="cl-error">{importError}</div>}
            {!importLoading && !importError && (
              <div className="cl-import-list">
                {importBroadcasts.length === 0 && <div className="cl-empty">No broadcasts found in Kit.</div>}
                {importBroadcasts.map(b => (
                  <label key={b.id} className="cl-import-row">
                    <input
                      type="checkbox"
                      checked={importSelected.has(b.id)}
                      onChange={e => {
                        const next = new Set(importSelected)
                        if (e.target.checked) next.add(b.id); else next.delete(b.id)
                        setImportSelected(next)
                      }}
                    />
                    <div className="cl-import-info">
                      <span className="cl-import-subject">{b.subject}</span>
                      {b.description && <span className="cl-import-desc">{b.description}</span>}
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="cl-modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowImportModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={!importSelected.size || importing}>
                {importing ? 'Importing…' : `Import ${importSelected.size} selected`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cl-templates-header">
        <div className="cl-section-title">{templates.length} email template{templates.length !== 1 ? 's' : ''}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={openImportModal}>Import from Kit</button>
          <button className="btn btn-primary" onClick={() => setAddingNew(true)} disabled={addingNew}>
            <IconPlus /> Add Template
          </button>
        </div>
      </div>

      <div className="cl-token-ref">
        <span className="cl-token-ref-label">Available tokens:</span>
        {TOKENS.map(t => <code key={t} className="cl-token">{t}</code>)}
      </div>

      {addingNew && (
        <div className="cl-template-editor cl-template-editor--new">
          <div className="cl-editor-title">New Template</div>
          <form onSubmit={handleAdd}>
            <TemplateForm data={newTemplate} onChange={setNewTemplate} />
            {addError && <div className="cl-error">{addError}</div>}
            <div className="cl-editor-actions">
              <button type="submit" className="btn btn-primary" disabled={saving || !newTemplate.subject.trim()}>
                {saving ? 'Saving…' : 'Add Template'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setAddingNew(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="cl-template-list">
        {templates.length === 0 && !addingNew && (
          <div className="cl-empty">No templates yet. Add one above or import from Kit.</div>
        )}
        {templates.map((tpl, idx) => {
          const isOpen = expandedId === tpl.id
          const editing = editingTemplate?.id === tpl.id ? editingTemplate : tpl
          return (
            <div key={tpl.id} className={`cl-template-item ${isOpen ? 'cl-template-item--open' : ''}`}>
              <div className="cl-template-header" onClick={() => {
                if (isOpen) { setExpandedId(null); setEditingTemplate(null) }
                else { setExpandedId(tpl.id); setEditingTemplate({ ...tpl }) }
              }}>
                <span className="cl-tpl-order">{tpl.sort_order}</span>
                <div className="cl-tpl-info">
                  <span className="cl-tpl-subject">{tpl.subject}</span>
                  <span className="cl-tpl-meta">{relDayLabel(tpl.relative_day)} · {fmtTime(tpl.send_time)}</span>
                  {tpl.description && <span className="cl-tpl-desc">{tpl.description}</span>}
                </div>
                <div className="cl-tpl-controls" onClick={e => e.stopPropagation()}>
                  <button className="cl-icon-btn" title="Move up" onClick={() => handleMove(idx, -1)} disabled={idx === 0}><IconUp /></button>
                  <button className="cl-icon-btn" title="Move down" onClick={() => handleMove(idx, 1)} disabled={idx === templates.length - 1}><IconDown /></button>
                  <button className="cl-icon-btn cl-icon-btn--danger" title="Delete" onClick={() => handleDelete(tpl.id)}><IconTrash /></button>
                </div>
                <span className="cl-tpl-chevron"><IconChevron open={isOpen} /></span>
              </div>

              {isOpen && editingTemplate && (
                <div className="cl-template-body">
                  <TemplateForm data={editingTemplate} onChange={setEditingTemplate} />
                  <div className="cl-editor-actions">
                    <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                    <button className="btn btn-ghost" onClick={() => { setExpandedId(null); setEditingTemplate(null) }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TemplateForm({ data, onChange }) {
  return (
    <div className="cl-template-form">
      <div className="cl-form-row">
        <label className="cl-label">Subject</label>
        <input className="cl-input" value={data.subject} onChange={e => onChange(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject" />
      </div>
      <div className="cl-form-cols">
        <div className="cl-form-row">
          <label className="cl-label">Relative Day</label>
          <input className="cl-input" type="number" value={data.relative_day} onChange={e => onChange(p => ({ ...p, relative_day: parseInt(e.target.value) || 0 }))} placeholder="-3, 0, 1, 2..." />
          <span className="cl-input-hint">{relDayLabel(data.relative_day)}</span>
        </div>
        <div className="cl-form-row">
          <label className="cl-label">Send Time</label>
          <input className="cl-input" type="time" value={data.send_time?.slice(0, 5) || ''} onChange={e => onChange(p => ({ ...p, send_time: e.target.value }))} />
        </div>
      </div>
      <div className="cl-form-row">
        <label className="cl-label">Description (internal)</label>
        <input className="cl-input" value={data.description || ''} onChange={e => onChange(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Day 1 morning reminder" />
      </div>
      <div className="cl-form-row cl-form-row--full">
        <label className="cl-label">Email Body (HTML)</label>
        <div className="cl-editor-split">
          <textarea
            className="cl-textarea"
            value={data.body_html || ''}
            onChange={e => onChange(p => ({ ...p, body_html: e.target.value }))}
            rows={14}
            placeholder="Paste your HTML email content here. Use tokens like {{ZOOM_WEBINAR_LINK}}"
          />
          <div className="cl-preview">
            <div className="cl-preview-label">Preview</div>
            <div className="cl-preview-frame" dangerouslySetInnerHTML={{ __html: data.body_html || '<p style="color:#888;font-size:13px">Preview will appear here</p>' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ challenges }) {
  const [expandedId, setExpandedId] = useState(null)

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (challenges.length === 0) {
    return <div className="cl-empty">No challenges launched yet.</div>
  }

  return (
    <div className="cl-history-tab">
      {challenges.map(ch => (
        <div key={ch.id} className="cl-history-item">
          <div className="cl-history-header" onClick={() => setExpandedId(expandedId === ch.id ? null : ch.id)}>
            <div className="cl-history-info">
              <span className="cl-challenge-name">{ch.name}</span>
              <span className="cl-challenge-meta">{fmtDate(ch.start_date)}</span>
              <span className={STATUS_CLASS[ch.status] || 'cl-status'}>{STATUS_LABELS[ch.status] || ch.status}</span>
              {ch.emails_scheduled > 0 && <span className="cl-challenge-meta">{ch.emails_scheduled} emails</span>}
            </div>
            <span className="cl-tpl-chevron"><IconChevron open={expandedId === ch.id} /></span>
          </div>

          {expandedId === ch.id && (
            <div className="cl-history-detail">
              <div className="cl-detail-row"><span className="cl-detail-label">Status</span><span>{STATUS_LABELS[ch.status]}</span></div>
              <div className="cl-detail-row"><span className="cl-detail-label">Start Date</span><span>{fmtDate(ch.start_date)}</span></div>
              <div className="cl-detail-row"><span className="cl-detail-label">Kit Tag</span><span>{ch.kit_tag_name || '—'} {ch.kit_tag_id && <code className="cl-code">#{ch.kit_tag_id}</code>}</span></div>
              <div className="cl-detail-row"><span className="cl-detail-label">Emails Scheduled</span><span>{ch.emails_scheduled || 0}</span></div>
              {ch.zoom_webinar_join_url && (
                <div className="cl-detail-row">
                  <span className="cl-detail-label">Main Zoom Link</span>
                  <span className="cl-link-row">
                    <a href={ch.zoom_webinar_join_url} target="_blank" rel="noreferrer" className="cl-link">{ch.zoom_webinar_join_url}</a>
                    <button className="cl-icon-btn" onClick={() => copyToClipboard(ch.zoom_webinar_join_url)} title="Copy"><IconCopy /></button>
                  </span>
                </div>
              )}
              {ch.zoom_meeting_join_url && (
                <div className="cl-detail-row">
                  <span className="cl-detail-label">VIP Zoom Link</span>
                  <span className="cl-link-row">
                    <a href={ch.zoom_meeting_join_url} target="_blank" rel="noreferrer" className="cl-link">{ch.zoom_meeting_join_url}</a>
                    <button className="cl-icon-btn" onClick={() => copyToClipboard(ch.zoom_meeting_join_url)} title="Copy"><IconCopy /></button>
                  </span>
                </div>
              )}
              {ch.error_log && <div className="cl-error" style={{ marginTop: 8 }}>{ch.error_log}</div>}
              <div className="cl-detail-row"><span className="cl-detail-label">Created</span><span>{fmtDate(ch.created_at)}</span></div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChallengeLauncher() {
  const [tab, setTab] = useState('launch')
  const [challenges, setChallenges] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [ch, tpl] = await Promise.all([fetchChallenges(), fetchChallengeTemplates()])
      setChallenges(ch)
      setTemplates(tpl)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="challenge-launcher">
      <div className="page-header">
        <div className="page-header-icon"><IconRocket /></div>
        <div>
          <div className="page-header-title">Challenge Launcher</div>
          <div className="page-header-subtitle">Launch 5-day live challenge events</div>
        </div>
      </div>

      <div className="cl-tabs">
        {[['launch', 'Launch'], ['templates', 'Email Templates'], ['history', 'History']].map(([id, label]) => (
          <button
            key={id}
            className={`cl-tab-btn ${tab === id ? 'cl-tab-btn--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'templates' && templates.length > 0 && (
              <span className="cl-tab-count">{templates.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="cl-body">
        {loading ? (
          <div className="cl-spinner-wrap"><div className="cl-spinner" /></div>
        ) : error ? (
          <div className="cl-error-state">
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={load}>Try again</button>
          </div>
        ) : (
          <>
            {tab === 'launch' && <LaunchTab challenges={challenges} templates={templates} onChallengesChange={setChallenges} />}
            {tab === 'templates' && <TemplatesTab templates={templates} onTemplatesChange={setTemplates} />}
            {tab === 'history' && <HistoryTab challenges={challenges} />}
          </>
        )}
      </div>
    </div>
  )
}
