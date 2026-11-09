// Yearly Planning: the numbers behind the page. Pure functions, no React.
// All money here is whole dollars. Dates are 'YYYY-MM-DD' strings.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const KINDS = { challenge: 'Challenge', brandbrain: 'Brand Brain', elite: 'Elite launch' }
export const OUTCOMES = { breakeven: 'Break-even', normal: 'Normal', homerun: 'Home run' }

export const DEFAULT_ASSUMPTIONS = {
  goal: 1000000,
  // What a challenge collects per ad dollar (cash in through cart close, includes first plan payments)
  multBreakeven: 1, multNormal: 1.5, multHomerun: 2,
  scaleAt: 60000, scaleHaircut: 0.1,
  // Tickets: cost per ticket rises as spend rises
  cptBase: 45, cptRef: 23000, cptCurve: 0.25,
  // Payment plans started per ticket, and the share who keep paying
  elitePlanRate: 0.009, elitePlanStay: 0.54, elitePlanPrice: 297, elitePlanMonths: 12,
  accelPlanRate: 0.022, accelPlanStay: 0.8, accelPlanPrice: 197, accelPlanMonths: 9,
  // Plans already sold in 2026 that are still paying in January, shrinking each month
  legacyPlans: 8000, legacyDecay: 0.08,
  // Elite monthly members from Elite-only launches
  elitePrice: 197, eliteChurn: 0.05,
  // Drop Studio monthly revenue
  dsStart: 2400, dsChurn: 0.15, dsBase: 300, dsPer453Tickets: 425,
  // Flat monthly lines
  printeez: 5000, affiliates: 4000, overhead: 8000, feeRate: 0.06,
  // Funding
  goldLimit: 52000, platinumRoom: 0, startCash: 20000, startGold: 23000, startPlatinum: 19400, startSpark: 5000,
  reserve: 20000, cashFloor: 5000, ownerPay: 13000, taxRate: 0.25, jan15Tax: 0, goldApr: 0.24, payoutLag: 3, frontEndShare: 0.15,
}

const CHALLENGES = [
  ['2027-01-11', 25000, 'normal'], ['2027-02-15', 30000, 'breakeven'], ['2027-03-15', 35000, 'normal'],
  ['2027-04-12', 40000, 'homerun'], ['2027-05-17', 50000, 'normal'], ['2027-06-14', 50000, 'homerun'],
  ['2027-08-09', 60000, 'breakeven'], ['2027-09-13', 70000, 'normal'], ['2027-10-11', 80000, 'homerun'], ['2027-11-08', 70000, 'normal'],
]
const BRAIN_DATES = ['2027-01-25', '2027-04-26', '2027-07-26', '2027-10-25']
const ELITE_DATES = ['2027-03-01', '2027-09-27']

export function defaultPlan() {
  return {
    year: 2027,
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    events: [
      ...CHALLENGES.map(([date, adSpend, outcome], i) => ({ id: `ch${i + 1}`, kind: 'challenge', name: `Launch Your Brand ${MONTHS[+date.slice(5, 7) - 1]}`, date, adSpend, adDays: 14, outcome })),
      ...BRAIN_DATES.map((date, i) => ({ id: `bb${i + 1}`, kind: 'brandbrain', name: `Brand Brain Q${i + 1}`, date, adSpend: 5000, adDays: 14, revenue: 25000 })),
      ...ELITE_DATES.map((date, i) => ({ id: `el${i + 1}`, kind: 'elite', name: `Elite launch ${i === 0 ? 'spring' : 'fall'}`, date, adSpend: 0, adDays: 0, joiners: 20 })),
    ],
  }
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekday = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay()
export const fmtDate = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
export const fmtShort = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const sortedEvents = (events) => [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

// The dated checklist for one launch. Follows the standing challenge timeline in business/facts.md.
export function keyDates(ev, previousCohortEnd) {
  const d = ev.date
  const adStart = ev.adDays ? addDays(d, -ev.adDays) : null
  if (ev.kind === 'challenge') {
    const cartClose = addDays(d, 7)
    let cohort = addDays(cartClose, 3) // Thursday after cart close
    const overlaps = previousCohortEnd && previousCohortEnd >= cohort
    if (overlaps) cohort = addDays(cohort, -1) // Wednesday when a cohort is still running Thursdays
    return {
      rows: [
        adStart && ['Ads start', adStart],
        ['Invite email 1', addDays(d, -7)],
        ['Invite email 2', addDays(d, -4)],
        ['Starts tomorrow email', addDays(d, -1)],
        ['Day 1, ads end 2pm CT', d],
        ['VIP $47 to $67, 11:59pm PT', d],
        ['VIP closes, 11:59pm PT', addDays(d, 1)],
        ['Cart opens, ~3pm CT', addDays(d, 3)],
        ['Day 5', addDays(d, 4)],
        ['Replays end, 11:59pm PT', addDays(d, 6)],
        ['Cart closes, 11:59pm PT', cartClose],
        ['VIP replays posted', addDays(cartClose, 1)],
        ['Cohort Week 1, 10am CT', cohort],
        ['Cohort Week 8', addDays(cohort, 49)],
      ].filter(Boolean),
      cartOpen: addDays(d, 3), cartClose, cohortStart: cohort, cohortEnd: addDays(cohort, 49), overlaps,
    }
  }
  if (ev.kind === 'brandbrain') {
    return {
      rows: [
        adStart && ['Ads start', adStart],
        ['Invite email 1', addDays(d, -7)],
        ['Invite email 2', addDays(d, -4)],
        ['Tomorrow email', addDays(d, -1)],
        ['Webinar, 12pm and 7:30pm CT', d],
        ['Sales calls open', d],
        ['Deadline, 11:59pm PT', addDays(d, 4)],
      ].filter(Boolean),
      cartOpen: d, cartClose: addDays(d, 4),
    }
  }
  return {
    rows: [
      ['Student invite email', addDays(d, -7)],
      ['Doors open', d],
      ['Doors close', addDays(d, 4)],
    ],
    cartOpen: d, cartClose: addDays(d, 4),
  }
}

// Key dates for every event, in date order, with cohort overlap worked out.
export function eventsWithDates(events) {
  const out = []
  let prevEnd = null
  for (const ev of sortedEvents(events)) {
    const kd = keyDates(ev, prevEnd)
    if (ev.kind === 'challenge') prevEnd = kd.cohortEnd
    const warnings = []
    if (ev.kind === 'challenge' && weekday(ev.date) !== 1) warnings.push('Not a Monday')
    if (ev.kind === 'challenge' && kd.overlaps) warnings.push('Previous cohort still running')
    out.push({ ...ev, kd, warnings })
  }
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    if (out[i].date <= prev.kd.cartClose) out[i].warnings.push(`Falls inside ${prev.name}'s cart window`)
  }
  return out
}

// ─── Revenue and profit, month by month ──────────────────────────────────────

function challengeResult(ev, a, scenario) {
  const s = Number(ev.adSpend) || 0
  const base = { breakeven: a.multBreakeven, normal: a.multNormal, homerun: a.multHomerun }[ev.outcome] ?? a.multNormal
  const mult = base * (s >= a.scaleAt ? 1 - a.scaleHaircut : 1)
  const stress = scenario === 'stress'
  const cash = s * (stress ? (s >= 50000 ? 1 : Math.min(mult, a.multNormal)) : mult)
  const cpt = stress ? 52 * Math.pow(s / a.cptRef, 0.35) : a.cptBase * Math.pow(s / a.cptRef, a.cptCurve)
  return { cash, tickets: s > 0 ? s / cpt : 0, planScale: stress ? 0.7 : 1 }
}

export function runPlan(plan, scenario = 'plan') {
  const a = plan.assumptions
  const months = MONTHS.map((m, i) => ({
    i, month: m, events: [], adSpend: 0, challengeCash: 0, tickets: 0, newPlans: 0,
    legacyPlans: a.legacyPlans * Math.pow(1 - a.legacyDecay, i), elite: 0, dropStudio: 0, brandBrain: 0, printeez: a.printeez, affiliates: a.affiliates,
  }))
  const byEvent = {}
  let eliteMembers = 0
  let ds = a.dsStart
  const tail = new Array(24).fill(0)

  for (let i = 0; i < 12; i++) {
    const row = months[i]
    const inMonth = sortedEvents(plan.events).filter((e) => e.date.slice(0, 4) === String(plan.year) && +e.date.slice(5, 7) - 1 === i)
    row.events = inMonth
    let joined = 0
    let monthTickets = 0
    for (const ev of inMonth) {
      row.adSpend += Number(ev.adSpend) || 0
      if (ev.kind === 'challenge') {
        const r = challengeResult(ev, a, scenario)
        row.challengeCash += r.cash
        monthTickets += r.tickets
        byEvent[ev.id] = r
        for (let k = 1; k < a.elitePlanMonths; k++) if (i + k < 24) tail[i + k] += r.tickets * a.elitePlanRate * r.planScale * a.elitePlanStay * a.elitePlanPrice
        for (let k = 1; k < a.accelPlanMonths; k++) if (i + k < 24) tail[i + k] += r.tickets * a.accelPlanRate * r.planScale * a.accelPlanStay * a.accelPlanPrice
      } else if (ev.kind === 'brandbrain') {
        row.brandBrain += Number(ev.revenue) || 0
        byEvent[ev.id] = { cash: Number(ev.revenue) || 0 }
      } else {
        joined += Number(ev.joiners) || 0
      }
    }
    row.tickets = monthTickets
    row.newPlans = tail[i]
    if (joined) eliteMembers += joined
    else eliteMembers *= 1 - a.eliteChurn
    row.elite = eliteMembers * a.elitePrice
    ds = ds * (1 - a.dsChurn) + a.dsBase + (monthTickets ? (monthTickets / 453) * a.dsPer453Tickets : 0)
    row.dropStudio = ds
    row.revenue = row.challengeCash + row.newPlans + row.legacyPlans + row.elite + row.dropStudio + row.brandBrain + row.printeez + row.affiliates
    row.fees = row.revenue * a.feeRate
    row.overhead = a.overhead
    row.profit = row.revenue - row.adSpend - row.overhead - row.fees
    row.recurring = row.newPlans + row.legacyPlans + row.elite + row.dropStudio + row.printeez + row.affiliates
  }
  const sum = (k) => months.reduce((t, m) => t + m[k], 0)
  return {
    months, byEvent,
    totals: { revenue: sum('revenue'), adSpend: sum('adSpend'), profit: sum('profit'), fees: sum('fees'), overhead: sum('overhead'), tickets: sum('tickets') },
  }
}

// ─── Funding: day-by-day cash and Amex Gold ──────────────────────────────────

export function runFunding(plan, result) {
  const a = plan.assumptions
  const year = plan.year
  const events = eventsWithDates(plan.events).filter((e) => e.date.slice(0, 4) === String(year))
  const adDay = {}, cashDay = {}
  const add = (map, d, v) => { map[d] = (map[d] || 0) + v }
  let start = `${year}-01-01`

  for (const ev of events) {
    const spend = Number(ev.adSpend) || 0
    const days = Number(ev.adDays) || 0
    if (spend && days) {
      for (let i = 0; i < days; i++) {
        const d = addDays(ev.date, -days + i)
        add(adDay, d, spend / days)
        if (d < start) start = d
      }
    }
    const r = result.byEvent[ev.id]
    if (!r) continue
    if (ev.kind === 'challenge') {
      const front = r.cash * a.frontEndShare
      if (days) for (let i = 0; i < days; i++) add(cashDay, addDays(ev.date, -days + i + a.payoutLag), front / days)
      const cartDays = 5
      for (let i = 0; i < cartDays; i++) add(cashDay, addDays(ev.kd.cartOpen, i + a.payoutLag), (r.cash - front) / cartDays)
    } else {
      for (let i = 0; i < 5; i++) add(cashDay, addDays(ev.date, i + a.payoutLag), r.cash / 5)
    }
  }

  const taxDue = {
    [`${year}-01-15`]: a.jan15Tax,
    [`${year}-04-15`]: Math.max(0, result.months.slice(0, 3).reduce((t, m) => t + m.profit, 0)) * a.taxRate,
    [`${year}-06-15`]: Math.max(0, result.months.slice(3, 5).reduce((t, m) => t + m.profit, 0)) * a.taxRate,
    [`${year}-09-15`]: Math.max(0, result.months.slice(5, 8).reduce((t, m) => t + m.profit, 0)) * a.taxRate,
  }

  let cash = a.startCash, gold = a.startGold, platinum = a.startPlatinum, spark = a.startSpark, unfunded = 0, interest = 0
  let minCash = cash, peakGold = gold, peakUnfunded = 0
  const eod = {}
  const end = `${year}-12-31`
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const y = +d.slice(0, 4), mi = +d.slice(5, 7) - 1
    const inYear = y === year
    const dim = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate()
    const m = inYear ? result.months[mi] : null
    const inflow = (cashDay[d] || 0) + (m ? m.recurring / dim : 0)
    cash += inflow - inflow * a.feeRate
    if (m) cash -= (a.overhead + a.ownerPay) / dim
    cash -= taxDue[d] || 0

    const ads = adDay[d] || 0
    gold += ads
    const dayInterest = gold * a.goldApr / 365
    gold += dayInterest
    interest += dayInterest

    if (gold > a.goldLimit) {
      const over = gold - a.goldLimit
      const fromCash = Math.min(over, Math.max(0, cash - a.cashFloor))
      cash -= fromCash; gold -= fromCash
      let left = over - fromCash
      if (left > 0 && a.platinumRoom > 0) {
        const used = Math.max(0, platinum - a.startPlatinum)
        const put = Math.min(left, Math.max(0, a.platinumRoom - used))
        platinum += put; gold -= put; left -= put
      }
      if (left > 0) { unfunded += left; gold -= left }
    }
    if (cash < a.cashFloor) { unfunded += a.cashFloor - cash; cash = a.cashFloor }

    // Sweep: anything above the reserve pays down what's owed, ads card first
    // (money for a tax payment due in the next 30 days stays in the bank)
    let taxSoon = 0
    for (const [due, amt] of Object.entries(taxDue)) if (due > d && due <= addDays(d, 30)) taxSoon += amt || 0
    let extra = Math.max(0, cash - a.reserve - taxSoon)
    const pay = (bal) => { const p = Math.min(extra, bal); extra -= p; cash -= p; return bal - p }
    unfunded = pay(unfunded); gold = pay(gold)
    if (gold <= 0) { platinum = pay(platinum); spark = pay(spark) }

    if (inYear || d === start) { minCash = Math.min(minCash, cash) }
    peakGold = Math.max(peakGold, gold)
    peakUnfunded = Math.max(peakUnfunded, unfunded)
    eod[d] = { cash, gold, platinum, spark, unfunded }
  }

  const before = (d) => eod[addDays(d, -1)] || { cash: a.startCash, gold: a.startGold, unfunded: 0 }
  const perEvent = events.filter((e) => Number(e.adSpend) > 0 && Number(e.adDays) > 0).map((ev) => {
    const adStart = addDays(ev.date, -ev.adDays)
    const atStart = before(adStart)
    let peak = 0, gapStart = atStart.unfunded, gapPeak = atStart.unfunded
    const stop = ev.kd.cartClose
    for (let d = adStart; d <= stop && d <= end; d = addDays(d, 1)) if (eod[d]) { peak = Math.max(peak, eod[d].gold); gapPeak = Math.max(gapPeak, eod[d].unfunded) }
    const payDown = Math.max(0, atStart.gold + Number(ev.adSpend) - a.goldLimit)
    const short = Math.max(0, gapPeak - gapStart)
    const status = short > 0.5 ? 'short' : payDown > 0 ? 'paydown' : peak > a.goldLimit * 0.85 ? 'tight' : 'ok'
    return { id: ev.id, name: ev.name, date: ev.date, adStart, adSpend: Number(ev.adSpend), goldAtStart: atStart.gold, cashAtStart: atStart.cash, peakGold: peak, payDown, short, status }
  })

  const monthEnds = MONTHS.map((month, i) => {
    const last = new Date(Date.UTC(year, i + 1, 0)).toISOString().slice(0, 10)
    return { month, ...eod[last] }
  })

  const last = eod[end] || {}
  return {
    start, perEvent, monthEnds, minCash, peakGold, peakUnfunded, interest, end: last,
    taxes: Object.values(taxDue).reduce((t, v) => t + (v || 0), 0),
    verdict: peakUnfunded > 0.5 ? 'short' : perEvent.some((e) => e.payDown > 0) ? 'paydown' : 'ok',
  }
}
