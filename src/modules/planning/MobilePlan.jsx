import { useState } from 'react'
import './planning-mobile.css'
import { BREAKDOWN, STATUS, GROUPS } from './labels.js'
import { KINDS, OUTCOMES, MONTHS, fmtDate } from './model.js'

// Phone version of Yearly Planning. Same plan and same math as the desktop page.

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TABS = [['months', 'Months'], ['launches', 'Launches'], ['funding', 'Funding'], ['inputs', 'Inputs']]

const usd = (n) => {
  if (n == null || Number.isNaN(n)) return '—'
  return (n < -0.5 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US')
}
const short = (n) => {
  if (n == null) return '—'
  const v = Math.abs(n)
  const sign = n < -0.5 ? '−$' : '$'
  if (v >= 1000000) return `${sign}${+(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `${sign}${Math.round(v / 1000)}K`
  return `${sign}${Math.round(v)}`
}
const dayOnly = (iso) => +iso.slice(8, 10)
const monthOf = (iso) => MONTHS[+iso.slice(5, 7) - 1]

function Chevron({ open }) {
  return (
    <svg className={`ypm-chev ${open ? 'open' : ''}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

function Num({ value, onChange, pct, prefix, label }) {
  const shown = value == null ? '' : pct ? +(value * 100).toFixed(2) : value
  return (
    <span className="ypm-num">
      {prefix && <i>{prefix}</i>}
      <input
        type="number" inputMode="decimal" aria-label={label} value={shown}
        onFocus={(e) => e.target.select()}
        onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); onChange(pct ? v / 100 : v) }}
      />
      {pct && <i>%</i>}
    </span>
  )
}

function Field({ label, children }) {
  return <label className="ypm-field"><span>{label}</span>{children}</label>
}

// ─── Months ──────────────────────────────────────────────────────────────────

function Months({ result, actuals }) {
  const [open, setOpen] = useState(null)
  const max = Math.max(...result.months.map((m) => m.revenue), 1)
  const actualBy = Object.fromEntries((actuals || []).map((a) => [a.month, a]))
  return (
    <div className="ypm-list">
      {result.months.map((m) => {
        const isOpen = open === m.i
        const a = actualBy[m.i]
        return (
          <div key={m.month} className={`ypm-card ${isOpen ? 'on' : ''}`}>
            <button className="ypm-month" onClick={() => setOpen(isOpen ? null : m.i)} aria-expanded={isOpen}>
              <div className="ypm-row">
                <span className="ypm-month-name">{FULL_MONTHS[m.i]}</span>
                <span className="ypm-month-rev">{usd(m.revenue)}</span>
              </div>
              <div className="ypm-track"><span style={{ width: `${Math.max(3, (m.revenue / max) * 100)}%` }} /></div>
              <div className="ypm-row sub">
                <span>{m.adSpend ? `${usd(m.adSpend)} ads` : 'No ads'}</span>
                <span className={m.profit < 0 ? 'neg' : 'pos'}>{usd(m.profit)} profit</span>
              </div>
              <div className="ypm-ev-lines">
                {m.events.length === 0 && <span className="ypm-ev none">No launch</span>}
                {m.events.map((e) => (
                  <span key={e.id} className="ypm-ev">
                    <em className={`dot ${e.kind}`} />
                    <b>{monthOf(e.date)} {dayOnly(e.date)}</b> {KINDS[e.kind]}
                    {e.kind === 'challenge' && <u className={e.outcome}>{OUTCOMES[e.outcome]}</u>}
                  </span>
                ))}
              </div>
              <span className="ypm-more">{isOpen ? 'Hide breakdown' : 'Breakdown'}<Chevron open={isOpen} /></span>
            </button>
            {isOpen && (
              <div className="ypm-rows inset">
                {BREAKDOWN.filter(([k]) => m[k] > 0.5).map(([k, label]) => <div key={k}><span>{label}</span><b>{usd(m[k])}</b></div>)}
                <div className="total"><span>Revenue</span><b>{usd(m.revenue)}</b></div>
                {m.adSpend > 0 && <div className="minus"><span>Ad spend</span><b>−{usd(m.adSpend)}</b></div>}
                <div className="minus"><span>Overhead</span><b>−{usd(m.overhead)}</b></div>
                <div className="minus"><span>Processing and refunds</span><b>−{usd(m.fees)}</b></div>
                <div className="total"><span>Profit</span><b className={m.profit < 0 ? 'neg' : 'pos'}>{usd(m.profit)}</b></div>
                {m.tickets > 0 && <div><span>Tickets expected</span><b>{Math.round(m.tickets).toLocaleString('en-US')}</b></div>}
                {a && <div><span>Actual revenue{a.partial ? ' so far' : ''}</span><b>{usd(a.revenue / 100)}</b></div>}
                {a && <div><span>Actual ads{a.partial ? ' so far' : ''}</span><b>{usd(a.adSpend / 100)}</b></div>}
              </div>
            )}
          </div>
        )
      })}
      <p className="ypm-note">Profit is before your pay and taxes.</p>
    </div>
  )
}

// ─── Launches ────────────────────────────────────────────────────────────────

function Launch({ ev, result, isOpen, onToggle, onChange, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const r = result.byEvent[ev.id]
  const sub = ev.kind === 'elite'
    ? `${ev.joiners} new members`
    : `${usd(ev.adSpend)} ads${ev.kind === 'challenge' ? ` · ${OUTCOMES[ev.outcome]}` : ''}`
  return (
    <div className={`ypm-card ${isOpen ? 'on' : ''}`}>
      <button className="ypm-launch" onClick={onToggle} aria-expanded={isOpen}>
        <span className={`ypm-tile ${ev.kind}`}><small>{monthOf(ev.date)}</small><b>{dayOnly(ev.date)}</b></span>
        <span className="ypm-launch-text">
          <b>{ev.name}</b>
          <span>{sub}</span>
          {ev.warnings.some((w) => w.includes('inside') || w.includes('Monday')) && <span className="warn">Check this date</span>}
        </span>
        <Chevron open={isOpen} />
      </button>
      {isOpen && (
        <div className="ypm-launch-body">
          <div className="ypm-form">
            <Field label="Name"><input className="ypm-text" value={ev.name} onChange={(e) => onChange({ name: e.target.value })} /></Field>
            <Field label="Start date"><input className="ypm-text" type="date" value={ev.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} /></Field>
            {ev.kind !== 'elite' && <Field label="Ad budget"><Num prefix="$" value={ev.adSpend} label="Ad budget" onChange={(v) => onChange({ adSpend: v })} /></Field>}
            {ev.kind !== 'elite' && <Field label="Days of ads"><Num value={ev.adDays} label="Days of ads" onChange={(v) => onChange({ adDays: Math.max(0, Math.round(v)) })} /></Field>}
            {ev.kind === 'brandbrain' && <Field label="Expected sales"><Num prefix="$" value={ev.revenue} label="Expected sales" onChange={(v) => onChange({ revenue: v })} /></Field>}
            {ev.kind === 'elite' && <Field label="New members"><Num value={ev.joiners} label="New members" onChange={(v) => onChange({ joiners: Math.max(0, Math.round(v)) })} /></Field>}
          </div>
          {ev.kind === 'challenge' && (
            <>
              <div className="ypm-label">Expected result</div>
              <div className="ypm-seg three">
                {Object.entries(OUTCOMES).map(([k, v]) => <button key={k} className={ev.outcome === k ? 'on' : ''} onClick={() => onChange({ outcome: k })}>{v}</button>)}
              </div>
              {r && <p className="ypm-note tight">Collects about <b>{usd(r.cash)}</b> from about <b>{Math.round(r.tickets).toLocaleString('en-US')}</b> tickets</p>}
            </>
          )}
          {ev.warnings.length > 0 && <p className="ypm-warn">{ev.warnings.join(' · ')}</p>}
          <div className="ypm-label">Key dates</div>
          <div className="ypm-rows">
            {ev.kd.rows.map(([label, d]) => <div key={label}><span>{label}</span><b>{fmtDate(d)}</b></div>)}
          </div>
          {confirming ? (
            <div className="ypm-confirm">
              <button className="danger" onClick={onDelete}>Remove it</button>
              <button onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          ) : <button className="ypm-remove" onClick={() => setConfirming(true)}>Remove this launch</button>}
        </div>
      )}
    </div>
  )
}

function Launches({ dated, result, onEvent, onDelete, onAdd }) {
  const [open, setOpen] = useState(null)
  return (
    <div className="ypm-list">
      {dated.map((ev) => (
        <Launch
          key={ev.id} ev={ev} result={result} isOpen={open === ev.id}
          onToggle={() => setOpen(open === ev.id ? null : ev.id)}
          onChange={(p) => onEvent(ev.id, p)}
          onDelete={() => { onDelete(ev.id); setOpen(null) }}
        />
      ))}
      <div className="ypm-label">Add a launch</div>
      <div className="ypm-seg three add">
        <button onClick={() => onAdd('challenge')}>+ Challenge</button>
        <button onClick={() => onAdd('brandbrain')}>+ Brand Brain</button>
        <button onClick={() => onAdd('elite')}>+ Elite</button>
      </div>
      <p className="ypm-note">Change a start date and every date under it moves too. Changes save on their own.</p>
    </div>
  )
}

// ─── Funding ─────────────────────────────────────────────────────────────────

const START_FIELDS = [
  ['startCash', 'Cash in checking', '$'], ['startGold', 'Amex Gold balance', '$'], ['startPlatinum', 'Amex Platinum balance', '$'], ['startSpark', 'Spark Cash balance', '$'],
  ['goldLimit', 'Gold Pay Over Time limit', '$'], ['platinumRoom', 'Extra room on Platinum', '$'], ['reserve', 'Cash to keep in bank', '$'], ['ownerPay', 'Your monthly pay', '$'], ['taxRate', 'Tax set-aside', '%'],
]

function Funding({ plan, funding, balances, onA }) {
  const a = plan.assumptions
  const [setup, setSetup] = useState(false)
  const paydowns = funding.perEvent.filter((e) => e.payDown > 0)
  const first = funding.perEvent.find((e) => e.short > 0.5)
  const verdict = funding.verdict === 'short'
    ? { tone: 'bad', title: `Short ${usd(funding.peakUnfunded)} at the worst point`, body: first ? `It first shows up around ${first.name}. Raise your starting cash or lower that ad budget.` : 'Raise your starting cash or lower an ad budget.' }
    : paydowns.length
      ? { tone: 'warn', title: 'You can fund this plan', body: `${paydowns.length} launch${paydowns.length > 1 ? 'es need' : ' needs'} a Gold payment during the ads. Biggest: ${usd(Math.max(...paydowns.map((p) => p.payDown)))}.` }
      : { tone: 'good', title: 'You can fund this plan', body: `Every launch fits under your ${usd(a.goldLimit)} Gold limit.` }
  const anyShort = funding.monthEnds.some((m) => m.unfunded > 0.5)
  return (
    <div className="ypm-list">
      <div className={`ypm-card ypm-verdict ${verdict.tone}`}><h2>{verdict.title}</h2><p>{verdict.body}</p></div>

      <div className="ypm-tiles">
        <div><span>Highest Gold</span><b>{short(funding.peakGold)}</b><small>of {short(a.goldLimit)} limit</small></div>
        <div><span>Lowest cash</span><b>{short(funding.minCash)}</b><small>keeping {short(a.reserve)}</small></div>
        <div><span>Taxes paid</span><b>{short(funding.taxes)}</b><small>{Math.round(a.taxRate * 100)}% of profit</small></div>
        <div><span>Gold interest</span><b>{short(funding.interest)}</b><small>{Math.round(a.goldApr * 100)}% APR guess</small></div>
      </div>

      <div className={`ypm-card ${setup ? 'on' : ''}`}>
        <button className="ypm-acc" onClick={() => setSetup(!setup)} aria-expanded={setup}><span>Where you start on Jan 1</span><Chevron open={setup} /></button>
        {setup && (
          <div className="ypm-launch-body">
            <p className="ypm-note tight">Estimates. Update them in late December.</p>
            <div className="ypm-form">
              {START_FIELDS.map(([k, label, t]) => <Field key={k} label={label}><Num value={a[k]} label={label} pct={t === '%'} prefix={t === '$' ? '$' : undefined} onChange={(v) => onA({ [k]: v })} /></Field>)}
            </div>
            {balances?.some((b) => b.cents) && (
              <>
                <div className="ypm-label">Balances today</div>
                <div className="ypm-rows">
                  {balances.filter((b) => b.cents).map((b) => <div key={b.name}><span>{b.name.replace(/\s*\(.*$/, '').replace(/®/g, '')}</span><b>{usd(Math.abs(b.cents) / 100)}</b></div>)}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ypm-label">Launch by launch</div>
      <div className="ypm-card ypm-funds">
        {funding.perEvent.map((e) => (
          <div key={e.id} className="ypm-fund">
            <div className="ypm-row"><b>{e.name}</b><span className={`ypm-pill ${STATUS[e.status][1]}`}>{e.status === 'paydown' ? 'Pay down' : STATUS[e.status][0]}</span></div>
            <div className="ypm-fund-sub">{short(e.adSpend)} ads from {monthOf(e.adStart)} {dayOnly(e.adStart)} · Gold {short(e.goldAtStart)} · Cash {short(e.cashAtStart)}</div>
            {e.payDown > 0 && <div className="ypm-fund-act">Pay {usd(e.payDown)} to Gold during ads</div>}
            {e.short > 0.5 && <div className="ypm-fund-act neg">Short {usd(e.short)}</div>}
          </div>
        ))}
      </div>

      <div className="ypm-label">End of each month</div>
      <div className="ypm-card">
        <table className="ypm-table">
          <thead><tr><th>Month</th><th>Cash</th><th>Gold</th><th>Other cards</th>{anyShort && <th>Short</th>}</tr></thead>
          <tbody>
            {funding.monthEnds.map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td><td>{short(m.cash)}</td><td>{short(m.gold)}</td><td>{short(m.platinum + m.spark)}</td>
                {anyShort && <td className={m.unfunded > 0.5 ? 'neg' : ''}>{m.unfunded > 0.5 ? short(m.unfunded) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

function Inputs({ a, onA, onReset }) {
  const [open, setOpen] = useState(null)
  const [resetting, setResetting] = useState(false)
  return (
    <div className="ypm-list">
      {GROUPS.map(([title, fields]) => {
        const isOpen = open === title
        return (
          <div key={title} className={`ypm-card ${isOpen ? 'on' : ''}`}>
            <button className="ypm-acc" onClick={() => setOpen(isOpen ? null : title)} aria-expanded={isOpen}><span>{title}</span><Chevron open={isOpen} /></button>
            {isOpen && (
              <div className="ypm-launch-body">
                <div className="ypm-form">
                  {fields.map(([k, label, type]) => <Field key={k} label={label}><Num value={a[k]} label={label} pct={type === '%'} prefix={type === '$' ? '$' : undefined} onChange={(v) => onA({ [k]: v })} /></Field>)}
                </div>
              </div>
            )}
          </div>
        )
      })}
      {resetting ? (
        <div className="ypm-confirm">
          <button className="danger" onClick={() => { onReset(); setResetting(false) }}>Yes, reset everything</button>
          <button onClick={() => setResetting(false)}>Cancel</button>
        </div>
      ) : <button className="ypm-remove" onClick={() => setResetting(true)}>Reset to the original plan</button>}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MobilePlan({ plan, result, funding, dated, actuals, balances, scenario, setScenario, save, onEvent, onDelete, onA, onAdd, onReset }) {
  const [tab, setTab] = useState('months')
  const t = result.totals
  const goal = plan.assumptions.goal
  const pct = Math.round((t.revenue / goal) * 100)
  const fundLabel = funding.verdict === 'short' ? `Short ${short(funding.peakUnfunded)}` : 'Fundable'
  return (
    <div className="pnl ypm">
      <header className="ypm-top">
        <h1>{plan.year} Plan</h1>
        <span className={`ypm-save ${save}`}>{save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved' : 'Saved'}</span>
      </header>

      <section className="ypm-hero">
        <div className="ypm-hero-main">
          <span>Projected revenue</span>
          <strong>{short(t.revenue)}</strong>
          <div className="ypm-goal"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <small>{pct}% of {short(goal)} goal</small>
        </div>
        <div className="ypm-hero-stats">
          <div><span>Ads</span><b>{short(t.adSpend)}</b></div>
          <div><span>Profit</span><b className="pos">{short(t.profit)}</b></div>
          <div><span>Funding</span><b className={funding.verdict === 'short' ? 'neg' : 'pos'}>{fundLabel}</b></div>
        </div>
      </section>

      <div className="ypm-seg two scen">
        <button className={scenario === 'plan' ? 'on' : ''} onClick={() => setScenario('plan')}>The plan</button>
        <button className={scenario === 'stress' ? 'on' : ''} onClick={() => setScenario('stress')}>If scaling goes badly</button>
      </div>

      <nav className="ypm-tabs" aria-label="Plan sections">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </nav>

      <main className="ypm-body">
        {tab === 'months' && <Months result={result} actuals={actuals} />}
        {tab === 'launches' && <Launches dated={dated} result={result} onEvent={onEvent} onDelete={onDelete} onAdd={onAdd} />}
        {tab === 'funding' && <Funding plan={plan} funding={funding} balances={balances} onA={onA} />}
        {tab === 'inputs' && <Inputs a={plan.assumptions} onA={onA} onReset={onReset} />}
      </main>
    </div>
  )
}
