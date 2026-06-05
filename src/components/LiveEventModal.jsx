import { useState, useEffect } from 'react'
import { fetchLiveEvent, saveLiveEvent } from '../services/api.js'

// Live Event singleton config. Edited monthly when Kerry sets up the new
// challenge. The data is injected into every AI email draft so the agent
// knows the current Zoom links, Facebook groups, and where we are in the
// event timeline.

export default function LiveEventModal({ onClose }) {
  const [info, setInfo] = useState({
    event_name: '', start_date: '', end_date: '',
    main_zoom_url: '', main_session_time: '',
    vip_zoom_url: '', vip_session_time: '',
    main_facebook_url: '', vip_facebook_url: '',
    notes: '',
  })
  const [phase, setPhase] = useState({ phase: 'none' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const data = await fetchLiveEvent()
        if (!mounted) return
        if (data.info) {
          setInfo({
            event_name: data.info.event_name || '',
            start_date: data.info.start_date || '',
            end_date: data.info.end_date || '',
            main_zoom_url: data.info.main_zoom_url || '',
            main_session_time: data.info.main_session_time || '',
            vip_zoom_url: data.info.vip_zoom_url || '',
            vip_session_time: data.info.vip_session_time || '',
            main_facebook_url: data.info.main_facebook_url || '',
            vip_facebook_url: data.info.vip_facebook_url || '',
            notes: data.info.notes || '',
          })
        }
        setPhase(data.phase || { phase: 'none' })
      } catch (err) {
        setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  function set(field, value) { setInfo((p) => ({ ...p, [field]: value })) }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const result = await saveLiveEvent(info)
      setPhase(result.phase || { phase: 'none' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  const phaseBanner = (() => {
    if (phase.phase === 'in_progress') return { text: `🟢 Event IN PROGRESS — Day ${phase.dayNumber} of ${phase.totalDays}`, cls: 'live-event-banner--in-progress' }
    if (phase.phase === 'upcoming') return { text: `⏳ Event UPCOMING — starts in ${phase.daysAway} day${phase.daysAway === 1 ? '' : 's'} (${phase.startDate})`, cls: 'live-event-banner--upcoming' }
    if (phase.phase === 'past') return { text: `⚪ Event PAST — ended ${phase.endDate}. Set new dates for the next one.`, cls: 'live-event-banner--past' }
    return { text: '⚙️ No event configured yet. Fill in the fields below.', cls: 'live-event-banner--none' }
  })()

  return (
    <div className="live-event-overlay" onClick={() => !saving && onClose()}>
      <div className="live-event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="live-event-header">
          <h3>Live Event Info</h3>
          <button className="icon-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className={`live-event-banner ${phaseBanner.cls}`}>{phaseBanner.text}</div>

        <div className="live-event-body">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>Loading…</div>
          ) : (
            <>
              <p className="live-event-help">
                This info is injected into every AI-drafted email reply. Update it once per month
                when you set up the new challenge. The agent will know the right Zoom links,
                Facebook groups, and what day of the event you're on.
              </p>

              <label className="live-event-label">Event name</label>
              <input className="live-event-input" placeholder="e.g. June 2026 Launch Your Brand Challenge"
                value={info.event_name} onChange={(e) => set('event_name', e.target.value)} />

              <div className="live-event-row">
                <div>
                  <label className="live-event-label">Start date</label>
                  <input type="date" className="live-event-input"
                    value={info.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </div>
                <div>
                  <label className="live-event-label">End date</label>
                  <input type="date" className="live-event-input"
                    value={info.end_date} onChange={(e) => set('end_date', e.target.value)} />
                </div>
              </div>

              <label className="live-event-label">Main session Zoom link</label>
              <input className="live-event-input" placeholder="https://zoom.us/j/..."
                value={info.main_zoom_url} onChange={(e) => set('main_zoom_url', e.target.value)} />

              <label className="live-event-label">Main session time (free text)</label>
              <input className="live-event-input" placeholder="e.g. Mon–Fri 7pm Central"
                value={info.main_session_time} onChange={(e) => set('main_session_time', e.target.value)} />

              <label className="live-event-label">VIP session Zoom link</label>
              <input className="live-event-input" placeholder="https://zoom.us/j/..."
                value={info.vip_zoom_url} onChange={(e) => set('vip_zoom_url', e.target.value)} />

              <label className="live-event-label">VIP session time (free text)</label>
              <input className="live-event-input" placeholder="e.g. Mon–Fri 6pm Central"
                value={info.vip_session_time} onChange={(e) => set('vip_session_time', e.target.value)} />

              <label className="live-event-label">Main Facebook group URL</label>
              <input className="live-event-input" placeholder="https://facebook.com/groups/..."
                value={info.main_facebook_url} onChange={(e) => set('main_facebook_url', e.target.value)} />

              <label className="live-event-label">VIP Facebook group URL</label>
              <input className="live-event-input" placeholder="https://facebook.com/groups/..."
                value={info.vip_facebook_url} onChange={(e) => set('vip_facebook_url', e.target.value)} />

              <label className="live-event-label">Notes (optional — anything else the agent should mention)</label>
              <textarea className="live-event-textarea" rows={3}
                placeholder="e.g. Replay links go up by 10pm CT each night."
                value={info.notes} onChange={(e) => set('notes', e.target.value)} />

              {error && <div className="live-event-error">{error}</div>}
            </>
          )}
        </div>

        <div className="live-event-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
