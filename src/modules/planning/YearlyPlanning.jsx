import { useState, useEffect, useMemo, useRef } from 'react'
import '../pnl/pnl.css'
import './planning.css'
import { defaultPlan, DEFAULT_ASSUMPTIONS, runPlan, runFunding, eventsWithDates, KINDS, OUTCOMES, fmtDate, fmtShort } from './model.js'

// Yearly Planning page. Math: model.js. Saved through /api/pnl/plan/:year (pnl/index.js).

const YEAR = 2027

const usd = (n) => {
  if (n == null || Number.isNaN(n)) return '—'
  const v = Math.round(Math.abs(n))
  return (n < -0.5 ? '−$' : '$') + v.toLocaleString('en-US')
}
const usdK = (n) => {
  if (n == null) return '—'
  const v = Math.abs(n)
  return (n < -0.5 ? '−$' : '$') + (v >= 1000 ? `${Math.round(v / 1000).toLocaleString('en-US')}K` : Math.round(v))
}

function NumField({ value, onChange, pct, prefix, step, label }) {
  const shown = value == null ? '' : pct ? +(value * 100).toFixed(2) : value
  return (
    <span className="yp-input-wrap">
      {prefix && <span className="yp-affix">{prefix}</span>}
      <input
        className="yp-input num"
        type="number"
        aria-label={label}
        step={step || (pct ? 0.1 : 500)}
        value={shown}
        onChange={(e) => { const v = e.target.value === '' ? 0 : Number(e.target.value); onChange(pct ? v / 100 : v) }}
      />
      {pct && <span className="yp-affix">%</span>}
    </span>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="pnl-card yp-stat">
      <h3>{label}</h3>
      <div className={`yp-stat-value num ${tone || ''}`}>{value}</div>
      {sub && <div className="yp-stat-sub">{sub}</div>}
    </div>
  )
}

// ─── Month by month ──────────────────────────────────────────────────────────

const BREAKDOWN = [
  ['challengeCash', 'Challenge cash collected'],
  ['newPlans', 'New payment plans (stacking)'],
  ['legacyPlans', '2026 payment plans still paying'],
  ['brandBrain', 'Brand Brain'],
  ['elite', 'Elite monthly (Elite launches)'],
  ['dropStudio', 'Drop Studio'],
  ['printeez', 'Printeez'],
  ['affiliates', 'Affiliates'],
]

function MonthMap({ result, actuals, dated }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (i) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const actualBy = Object.fromEntries((actuals || []).map((a) => [a.month, a]))
  const hasActuals = (actuals || []).length > 0
  const datedBy = Object.fromEntries(dated.map((e) => [e.id, e]))
  return (
    <div className="pnl-card yp-table-card">
      <div className="yp-scroll">
        <table className="yp-table yp-map">
          <thead>
            <tr>
              <th>Month</th>
              <th>Launches</th>
              <th className="r">Ad spend</th>
              <th className="r">Revenue</th>
              <th className="r">Profit</th>
              {hasActuals && <th className="r">Actual revenue</th>}
              {hasActuals && <th className="r">Actual ads</th>}
            </tr>
          </thead>
          <tbody>
            {result.months.map((m) => {
              const a = actualBy[m.i]
              const isOpen = open.has(m.i)
              return [
                <tr key={m.month} className="yp-row" onClick={() => toggle(m.i)}>
                  <td className="yp-month"><span className={`yp-caret ${isOpen ? 'on' : ''}`}>›</span>{m.month}</td>
                  <td>
                    <div className="yp-chips">
                      {m.events.length === 0 && <span className="yp-none">No launch</span>}
                      {m.events.map((e) => (
                        <span key={e.id} className={`yp-chip ${e.kind}`}>
                          {KINDS[e.kind]} <b>{fmtShort(e.date)}</b>
                          {e.kind === 'challenge' && <em className={e.outcome}>{OUTCOMES[e.outcome]}</em>}
                          {datedBy[e.id]?.warnings.some((w) => w.includes('inside') || w.includes('Monday')) && <i title={datedBy[e.id].warnings.join(', ')}>!</i>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="r num">{m.adSpend ? usd(m.adSpend) : '—'}</td>
                  <td className="r num strong">{usd(m.revenue)}</td>
                  <td className={`r num ${m.profit < 0 ? 'neg' : 'pos'}`}>{usd(m.profit)}</td>
                  {hasActuals && <td className="r num">{a ? usd(a.revenue / 100) : '—'}</td>}
                  {hasActuals && <td className="r num">{a ? usd(a.adSpend / 100) : '—'}</td>}
                </tr>,
                isOpen && (
                  <tr key={`${m.month}-d`} className="yp-detail">
                    <td colSpan={hasActuals ? 7 : 5}>
                      <div className="yp-breakdown">
                        {BREAKDOWN.map(([k, label]) => (
                          <div key={k}><span>{label}</span><b className="num">{usd(m[k])}</b></div>
                        ))}
                        <div className="minus"><span>Ad spend</span><b className="num">−{usd(m.adSpend)}</b></div>
                        <div className="minus"><span>Overhead</span><b className="num">−{usd(m.overhead)}</b></div>
                        <div className="minus"><span>Processing and refunds</span><b className="num">−{usd(m.fees)}</b></div>
                        {m.tickets > 0 && <div><span>Tickets expected</span><b className="num">{Math.round(m.tickets).toLocaleString('en-US')}</b></div>}
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td className="r num">{usd(result.totals.adSpend)}</td>
              <td className="r num">{usd(result.totals.revenue)}</td>
              <td className="r num">{usd(result.totals.profit)}</td>
              {hasActuals && <td />}
              {hasActuals && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="yp-note">Click a month for the breakdown. Ad spend and launch money are counted in the month the launch starts. Profit is before your pay and taxes.</p>
    </div>
  )
}

// ─── Launch dates ────────────────────────────────────────────────────────────

function EventCard({ ev, onChange, onDelete, result }) {
  const [confirming, setConfirming] = useState(false)
  const r = result.byEvent[ev.id]
  return (
    <div className={`pnl-card yp-event ${ev.kind}`}>
      <div className="yp-event-head">
        <span className={`yp-tag ${ev.kind}`}>{KINDS[ev.kind]}</span>
        <input className="yp-name" aria-label="Launch name" value={ev.name} onChange={(e) => onChange({ name: e.target.value })} />
        {confirming ? (
          <span className="yp-del-confirm">
            <button className="pnl-btn small" onClick={() => onDelete()}>Remove it</button>
            <button className="pnl-btn small" onClick={() => setConfirming(false)}>Keep</button>
          </span>
        ) : (
          <button className="yp-x" aria-label={`Remove ${ev.name}`} onClick={() => setConfirming(true)}>×</button>
        )}
      </div>
      <div className="yp-fields">
        <label>Start date<input className="yp-input" type="date" value={ev.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} /></label>
        {ev.kind !== 'elite' && <label>Ad budget<NumField prefix="$" value={ev.adSpend} step={1000} label="Ad budget" onChange={(v) => onChange({ adSpend: v })} /></label>}
        {ev.kind !== 'elite' && <label>Ad days<NumField value={ev.adDays} step={1} label="Ad days" onChange={(v) => onChange({ adDays: Math.max(0, Math.round(v)) })} /></label>}
        {ev.kind === 'challenge' && (
          <label>Expected result
            <select className="yp-input" value={ev.outcome} onChange={(e) => onChange({ outcome: e.target.value })}>
              {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
        {ev.kind === 'brandbrain' && <label>Expected sales<NumField prefix="$" value={ev.revenue} step={1000} label="Expected sales" onChange={(v) => onChange({ revenue: v })} /></label>}
        {ev.kind === 'elite' && <label>New members<NumField value={ev.joiners} step={1} label="New members" onChange={(v) => onChange({ joiners: Math.max(0, Math.round(v)) })} /></label>}
      </div>
      {ev.kind === 'challenge' && r && (
        <div className="yp-event-sum">
          Collects about <b className="num">{usd(r.cash)}</b> · about <b className="num">{Math.round(r.tickets).toLocaleString('en-US')}</b> tickets
        </div>
      )}
      {ev.warnings.length > 0 && <div className="yp-warn">{ev.warnings.join(' · ')}</div>}
      <dl className="yp-dates">
        {ev.kd.rows.map(([label, d]) => (
          <div key={label}><dt>{label}</dt><dd className="num">{fmtDate(d)}</dd></div>
        ))}
      </dl>
    </div>
  )
}

function LaunchDates({ dated, result, onEvent, onDelete, onAdd }) {
  return (
    <>
      <div className="yp-add">
        <button className="pnl-btn small" onClick={() => onAdd('challenge')}>+ Challenge</button>
        <button className="pnl-btn small" onClick={() => onAdd('brandbrain')}>+ Brand Brain</button>
        <button className="pnl-btn small" onClick={() => onAdd('elite')}>+ Elite launch</button>
        <span className="yp-note inline">Change a start date and every date under it moves too. Changes save on their own.</span>
      </div>
      <div className="yp-events">
        {dated.map((ev) => <EventCard key={ev.id} ev={ev} result={result} onChange={(p) => onEvent(ev.id, p)} onDelete={() => onDelete(ev.id)} />)}
      </div>
    </>
  )
}

// ─── Funding ─────────────────────────────────────────────────────────────────

const STATUS = {
  ok: ['Covered', 'good'],
  tight: ['Tight', 'warn'],
  paydown: ['Pay down during ads', 'warn'],
  short: ['Short', 'bad'],
}

function Funding({ plan, funding, balances, onA }) {
  const a = plan.assumptions
  const paydowns = funding.perEvent.filter((e) => e.payDown > 0)
  const first = funding.perEvent.find((e) => e.short > 0.5)
  const verdict = funding.verdict === 'short'
    ? { tone: 'bad', title: `Short by about ${usd(funding.peakUnfunded)} at the worst point`, body: first ? `It first shows up around ${first.name} (ads start ${fmtShort(first.adStart)}). Raise your starting cash, lower that ad budget, or get a line of credit for that amount.` : 'Raise your starting cash or lower an ad budget.' }
    : paydowns.length
      ? { tone: 'warn', title: 'You can fund this plan', body: `${paydowns.length} launch${paydowns.length > 1 ? 'es need' : ' needs'} a payment to Gold before or during the ad run to fit under your ${usd(a.goldLimit)} limit. The biggest is ${usd(Math.max(...paydowns.map((p) => p.payDown)))}.` }
      : { tone: 'good', title: 'You can fund this plan', body: `Every launch fits under your ${usd(a.goldLimit)} Gold limit with no extra payments.` }
  return (
    <>
      <div className={`pnl-card yp-verdict ${verdict.tone}`}>
        <h2>{verdict.title}</h2>
        <p>{verdict.body}</p>
      </div>
      <div className="yp-stats four">
        <Stat label="Highest Gold balance" value={usd(funding.peakGold)} sub={`Limit ${usd(a.goldLimit)}`} />
        <Stat label="Lowest cash" value={usd(funding.minCash)} sub={`Keeping ${usd(a.reserve)} in the bank`} />
        <Stat label="Estimated taxes paid" value={usd(funding.taxes)} sub={`${Math.round(a.taxRate * 100)}% of profit, Apr to Sep`} />
        <Stat label="Interest on Gold" value={usd(funding.interest)} sub={`${Math.round(a.goldApr * 100)}% APR estimate`} />
      </div>

      <div className="pnl-card yp-setup">
        <h3>Where you start on Jan 1</h3>
        <p className="yp-note">These are estimates based on today's balances and how November should finish. Update them in late December.</p>
        <div className="yp-fields wide">
          <label>Cash in checking<NumField prefix="$" value={a.startCash} label="Starting cash" onChange={(v) => onA({ startCash: v })} /></label>
          <label>Amex Gold balance<NumField prefix="$" value={a.startGold} label="Starting Gold balance" onChange={(v) => onA({ startGold: v })} /></label>
          <label>Amex Platinum balance<NumField prefix="$" value={a.startPlatinum} label="Starting Platinum balance" onChange={(v) => onA({ startPlatinum: v })} /></label>
          <label>Spark Cash balance<NumField prefix="$" value={a.startSpark} label="Starting Spark balance" onChange={(v) => onA({ startSpark: v })} /></label>
          <label>Gold Pay Over Time limit<NumField prefix="$" value={a.goldLimit} step={1000} label="Gold limit" onChange={(v) => onA({ goldLimit: v })} /></label>
          <label>Extra room on Platinum<NumField prefix="$" value={a.platinumRoom} step={1000} label="Platinum room" onChange={(v) => onA({ platinumRoom: v })} /></label>
          <label>Cash to keep in bank<NumField prefix="$" value={a.reserve} step={1000} label="Cash reserve" onChange={(v) => onA({ reserve: v })} /></label>
          <label>Your monthly pay<NumField prefix="$" value={a.ownerPay} step={500} label="Monthly pay" onChange={(v) => onA({ ownerPay: v })} /></label>
          <label>Tax set-aside<NumField pct value={a.taxRate} label="Tax set-aside" onChange={(v) => onA({ taxRate: v })} /></label>
        </div>
        {balances?.length > 0 && (
          <div className="yp-today">
            <span>Balances today:</span>
            {balances.filter((b) => b.cents).map((b) => <span key={b.name}>{b.name.replace(/\s*\(.*$/, '').replace(/®/g, '')} <b className="num">{usd(Math.abs(b.cents) / 100)}</b></span>)}
          </div>
        )}
      </div>

      <div className="pnl-card yp-table-card">
        <h3 className="yp-h">Launch by launch</h3>
        <div className="yp-scroll">
          <table className="yp-table">
            <thead><tr><th>Launch</th><th>Ads start</th><th className="r">Ad budget</th><th className="r">Gold at start</th><th className="r">Pay to Gold during ads</th><th className="r">Cash at start</th><th className="r">Short by</th><th>Status</th></tr></thead>
            <tbody>
              {funding.perEvent.map((e) => (
                <tr key={e.id}>
                  <td className="strong">{e.name}</td>
                  <td className="num">{fmtShort(e.adStart)}</td>
                  <td className="r num">{usd(e.adSpend)}</td>
                  <td className="r num">{usd(e.goldAtStart)}</td>
                  <td className="r num">{e.payDown > 0 ? usd(e.payDown) : '—'}</td>
                  <td className="r num">{usd(e.cashAtStart)}</td>
                  <td className={`r num ${e.short > 0.5 ? 'neg' : ''}`}>{e.short > 0.5 ? usd(e.short) : '—'}</td>
                  <td><span className={`yp-status ${STATUS[e.status][1]}`}>{STATUS[e.status][0]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pnl-card yp-table-card">
        <h3 className="yp-h">End of each month</h3>
        <div className="yp-scroll">
          <table className="yp-table">
            <thead><tr><th>Month</th><th className="r">Cash</th><th className="r">Gold</th><th className="r">Platinum</th><th className="r">Spark</th><th className="r">Short</th></tr></thead>
            <tbody>
              {funding.monthEnds.map((m) => (
                <tr key={m.month}>
                  <td className="strong">{m.month}</td>
                  <td className="r num">{usd(m.cash)}</td>
                  <td className="r num">{usd(m.gold)}</td>
                  <td className="r num">{usd(m.platinum)}</td>
                  <td className="r num">{usd(m.spark)}</td>
                  <td className={`r num ${m.unfunded > 0.5 ? 'neg' : ''}`}>{m.unfunded > 0.5 ? usd(m.unfunded) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Assumptions ─────────────────────────────────────────────────────────────

const GROUPS = [
  ['What a challenge collects per ad dollar', [
    ['multBreakeven', 'Break-even', 'x'], ['multNormal', 'Normal', 'x'], ['multHomerun', 'Home run', 'x'],
    ['scaleAt', 'Budget where results soften', '$'], ['scaleHaircut', 'How much they soften', '%'],
  ]],
  ['Tickets', [
    ['cptBase', 'Cost per ticket at base spend', '$'], ['cptRef', 'Base spend', '$'], ['cptCurve', 'Cost rise as spend rises', 'x'],
  ]],
  ['Payment plans', [
    ['elitePlanRate', 'Elite plan starts per ticket', '%'], ['elitePlanStay', 'Elite plans that keep paying', '%'], ['elitePlanPrice', 'Elite monthly', '$'], ['elitePlanMonths', 'Elite months', 'n'],
    ['accelPlanRate', 'Accelerator plan starts per ticket', '%'], ['accelPlanStay', 'Accelerator plans that keep paying', '%'], ['accelPlanPrice', 'Accelerator monthly', '$'], ['accelPlanMonths', 'Accelerator months', 'n'],
    ['legacyPlans', '2026 plans still paying in Jan', '$'], ['legacyDecay', 'Monthly drop in 2026 plans', '%'],
  ]],
  ['Monthly income', [
    ['printeez', 'Printeez', '$'], ['affiliates', 'Affiliates', '$'], ['elitePrice', 'Elite monthly price', '$'], ['eliteChurn', 'Elite monthly cancels', '%'],
    ['dsStart', 'Drop Studio now', '$'], ['dsChurn', 'Drop Studio monthly cancels', '%'], ['dsBase', 'Drop Studio added with no launch', '$'], ['dsPer453Tickets', 'Drop Studio added per 453 tickets', '$'],
  ]],
  ['Costs', [
    ['overhead', 'Monthly overhead', '$'], ['feeRate', 'Processing and refunds', '%'], ['goldApr', 'Gold interest rate', '%'], ['payoutLag', 'Days until sales hit the bank', 'n'], ['jan15Tax', 'Jan 15 tax payment', '$'],
  ]],
]

function Assumptions({ a, onA }) {
  return (
    <div className="yp-groups">
      {GROUPS.map(([title, fields]) => (
        <div className="pnl-card" key={title}>
          <h3>{title}</h3>
          <div className="yp-fields wide">
            {fields.map(([k, label, type]) => (
              <label key={k}>{label}
                <NumField
                  value={a[k]} label={label} pct={type === '%'} prefix={type === '$' ? '$' : undefined}
                  step={type === 'x' ? 0.05 : type === 'n' ? 1 : type === '%' ? 0.1 : a[k] >= 1000 ? 500 : 5}
                  onChange={(v) => onA({ [k]: v })}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TABS = [['map', 'Month by month'], ['dates', 'Launch dates'], ['funding', 'Funding'], ['assume', 'Assumptions']]

export default function YearlyPlanning() {
  const [plan, setPlan] = useState(null)
  const [balances, setBalances] = useState([])
  const [actuals, setActuals] = useState([])
  const [error, setError] = useState('')
  const [tab, setTab] = useState('map')
  const [scenario, setScenario] = useState('plan')
  const [save, setSave] = useState('saved')
  const [resetting, setResetting] = useState(false)
  const timer = useRef(null)
  const latest = useRef(null)

  useEffect(() => {
    let live = true
    fetch(`/api/pnl/plan/${YEAR}`, { signal: AbortSignal.timeout(60000) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || `Could not load the plan (${r.status})`)
        return d
      })
      .then((d) => {
        if (!live) return
        const base = defaultPlan()
        setPlan(d.plan ? { ...base, ...d.plan, assumptions: { ...DEFAULT_ASSUMPTIONS, ...d.plan.assumptions } } : base)
        setBalances(d.balances || [])
        setActuals(d.actuals || [])
      })
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [])

  const persist = async () => {
    setSave('saving')
    try {
      const r = await fetch(`/api/pnl/plan/${YEAR}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(latest.current) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Save failed') }
      setSave('saved')
    } catch (e) {
      setSave('error')
      console.error('[Yearly Planning] save failed', e)
    }
  }

  const update = (fn) => {
    setPlan((p) => {
      const next = fn(p)
      latest.current = next
      return next
    })
    setSave('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 700)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const result = useMemo(() => (plan ? runPlan(plan, scenario) : null), [plan, scenario])
  const funding = useMemo(() => (plan && result ? runFunding(plan, result) : null), [plan, result])
  const dated = useMemo(() => (plan ? eventsWithDates(plan.events) : []), [plan])

  if (error) return <div className="pnl yp"><div className="pnl-wrap"><h1 className="yp-title">{YEAR} Plan</h1><div className="pnl-card yp-verdict bad"><p>{error}</p></div></div></div>
  if (!plan) return <div className="pnl yp"><div className="pnl-wrap"><h1 className="yp-title">{YEAR} Plan</h1><p className="yp-note">Loading…</p></div></div>

  const onEvent = (id, patch) => update((p) => ({ ...p, events: p.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const onDelete = (id) => update((p) => ({ ...p, events: p.events.filter((e) => e.id !== id) }))
  const onA = (patch) => update((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } }))
  const onAdd = (kind) => update((p) => {
    const id = `${kind}-${Date.now()}`
    const base = { id, kind, date: `${YEAR}-12-06`, name: `New ${KINDS[kind]}` }
    const extra = kind === 'challenge' ? { adSpend: 25000, adDays: 14, outcome: 'normal' } : kind === 'brandbrain' ? { adSpend: 5000, adDays: 14, revenue: 25000 } : { adSpend: 0, adDays: 0, joiners: 20 }
    return { ...p, events: [...p.events, { ...base, ...extra }] }
  })
  const onReset = () => { update(() => defaultPlan()); setResetting(false) }

  const t = result.totals
  const pctGoal = Math.round((t.revenue / plan.assumptions.goal) * 100)
  const fundText = funding.verdict === 'short' ? `Short ${usdK(funding.peakUnfunded)}` : 'Fundable'
  const fundSub = funding.verdict === 'short' ? 'See Funding' : funding.perEvent.some((e) => e.payDown > 0) ? 'With Gold paydowns' : 'Fits your Gold limit'

  return (
    <div className="pnl yp">
      <div className="pnl-wrap">
        <div className="pnl-header yp-header">
          <div>
            <h1>{YEAR} Plan</h1>
            <div className="pnl-fresh">
              <span className={save === 'error' ? 'warn' : ''}>{save === 'saving' ? 'Saving…' : save === 'error' ? 'Could not save. Try again.' : 'All changes saved'}</span>
            </div>
          </div>
          <div className="pnl-actions yp-actions">
            <div className="yp-toggle" role="group" aria-label="Scenario">
              <button className={scenario === 'plan' ? 'on' : ''} onClick={() => setScenario('plan')}>The plan</button>
              <button className={scenario === 'stress' ? 'on' : ''} onClick={() => setScenario('stress')}>If scaling goes badly</button>
            </div>
            {resetting ? (
              <>
                <button className="pnl-btn small" onClick={onReset}>Yes, reset everything</button>
                <button className="pnl-btn small" onClick={() => setResetting(false)}>Cancel</button>
              </>
            ) : <button className="pnl-btn small" onClick={() => setResetting(true)}>Reset</button>}
          </div>
        </div>

        <div className="yp-stats">
          <Stat label={`Revenue (${pctGoal}% of ${plan.assumptions.goal >= 1000000 ? `$${+(plan.assumptions.goal / 1000000).toFixed(2)}M` : usdK(plan.assumptions.goal)} goal)`} value={usd(t.revenue)} sub={<span className="yp-bar"><span style={{ width: `${Math.min(100, pctGoal)}%` }} /></span>} />
          <Stat label="Ad spend" value={usd(t.adSpend)} sub={`${Math.round(t.tickets).toLocaleString('en-US')} tickets expected`} />
          <Stat label="Profit" value={usd(t.profit)} sub="Before your pay and taxes" tone="pos" />
          <Stat label="Funding" value={fundText} sub={fundSub} tone={funding.verdict === 'short' ? 'neg' : 'pos'} />
        </div>

        <div className="pnl-tabs yp-tabs">
          {TABS.map(([k, l]) => <div key={k} className={`pnl-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</div>)}
        </div>

        <div className="yp-body">
          {tab === 'map' && <MonthMap result={result} actuals={actuals} dated={dated} />}
          {tab === 'dates' && <LaunchDates dated={dated} result={result} onEvent={onEvent} onDelete={onDelete} onAdd={onAdd} />}
          {tab === 'funding' && <Funding plan={plan} funding={funding} balances={balances} onA={onA} />}
          {tab === 'assume' && <Assumptions a={plan.assumptions} onA={onA} />}
        </div>
      </div>
    </div>
  )
}

