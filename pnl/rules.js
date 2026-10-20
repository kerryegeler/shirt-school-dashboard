// P&L sorting rules: which business a sale belongs to, and how bank/card lines
// are treated (expense, revenue, payout, transfer…). Kerry's rules, 2026-10-20.

export const BUSINESSES = ['Shirt School', 'Elite', 'Drop Studio', 'Brand Brain', 'Consulting']

export const EXPENSE_CATEGORIES = [
  'Advertising', 'Software & subscriptions', 'Contractors & freelancers', 'Payment processing',
  'Product & printing', 'Education & coaching', 'Professional fees', 'Travel', 'Meals',
  'Office & equipment', 'Phone & internet', 'Bank fees & interest', 'Taxes & licenses',
  'Card credits & rewards', 'Other',
]

// Kinds that count in the P&L. Everything else (payout, transfer, owner_draw, personal, ignore) does not.
export const KINDS = ['expense', 'revenue', 'refund', 'payout', 'transfer', 'owner_draw', 'personal', 'ignore']

// ─── Revenue: business + clean product name ──────────────────────────────────

export function cleanProduct(r) {
  let p = (r.product_name || '').trim()
  if (p.startsWith('{')) { try { p = JSON.parse(p).title || p } catch { /* keep */ } }
  p = p.replace(/^"+|"+$/g, '').trim()
  if (p) return p
  const d = (r.description || '').trim()
  switch (r.source) {
    case 'stripe':
      if (/brand brain/i.test(d)) return 'Brand Brain Install'
      if (/^subscription/i.test(d)) return 'Drop Studio subscription'
      if (/^stripe (charge|payment)$/i.test(d)) return 'Drop Studio one-time purchase'
      if (/serve.?first/i.test(d)) return 'Serve-First'
      if (/^payment for invoice$|^\w+ \d+-\d+$/i.test(d)) return 'Consulting retainer / invoice'
      return d || 'Stripe payment'
    case 'impact': return 'Impact affiliate'
    case 'adsense': return 'YouTube / AdSense'
    case 'partnerstack': return 'PartnerStack affiliate'
    case 'paypal': return 'PayPal'
    case 'affiliate_other': return d || 'Affiliate'
    case 'bank_deposit': return d || 'Bank deposit'
    default: return d || 'Other'
  }
}

export function revenueBusiness(r) {
  if (r.business) return r.business // manual override
  const p = cleanProduct(r)
  if (r.source === 'kajabi') return /elite/i.test(p) ? 'Elite' : 'Shirt School'
  if (r.source === 'stripe') {
    const d = r.description || ''
    if (/brand brain/i.test(d)) return 'Brand Brain'
    if (/^subscription|^stripe (charge|payment)$/i.test(d)) return 'Drop Studio'
    return 'Consulting' // invoices, Serve-First Accelerator, retainers
  }
  return 'Shirt School' // affiliates, AdSense, other income
}

// ─── Bank/card lines ─────────────────────────────────────────────────────────

export function accountKind(account) {
  return /checking|savings/i.test(account?.name || '') ? 'bank' : 'card'
}

// Starting rules, from the first 90 days of real data. Lower priority runs first.
// [pattern, account_kind, direction, kind, category, business, priority]
export const DEFAULT_RULES = [
  // Money moving between Kerry's own accounts
  ['american express', 'bank', 'out', 'transfer', null, null, 10],
  ['capital one', 'bank', 'out', 'transfer', null, null, 10],
  ['chase credit card', 'bank', 'out', 'transfer', null, null, 10],
  ['us bank payment', 'bank', 'out', 'transfer', null, null, 10],
  ['to acc egeler kerry', 'bank', 'out', 'owner_draw', null, null, 10],
  ['account verification', 'bank', null, 'ignore', null, null, 10],
  ['payment', 'card', 'in', 'transfer', null, null, 20],            // card bill paid
  ['autopay', 'card', 'in', 'transfer', null, null, 20],
  ['pymt', 'card', 'in', 'transfer', null, null, 20],
  // Sales already counted from Stripe/Kajabi
  ['stripe', 'bank', 'in', 'payout', null, null, 30],
  ['on behalf of kaj', 'bank', 'in', 'payout', null, null, 30],
  ['on behalf of kaj', 'bank', 'out', 'refund', null, 'Shirt School', 30],
  // Other income → Shirt School (Kerry, 2026-10-20)
  ['impact radius', 'bank', 'in', 'revenue', 'Affiliate', 'Shirt School', 40],
  ['youtube', 'bank', 'in', 'revenue', 'YouTube / AdSense', 'Shirt School', 40],
  ['google adsense', 'bank', 'in', 'revenue', 'YouTube / AdSense', 'Shirt School', 40],
  ['paypal transfer', 'bank', 'in', 'revenue', 'Affiliate', 'Shirt School', 40],
  ['gelato', 'bank', 'in', 'revenue', 'Affiliate', 'Shirt School', 40],
  ['shopify', 'bank', 'in', 'revenue', 'Affiliate', 'Shirt School', 40],
  ['partnerstack', 'bank', 'in', 'revenue', 'Affiliate', 'Shirt School', 40],
  // Bank and card costs
  ['interest charge', null, 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['statement service fee', null, 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['annual fee', null, 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['late fee', null, 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['paper statement', 'bank', 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['atm surcharge', 'bank', 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['non midfirst atm', 'bank', 'out', 'expense', 'Bank fees & interest', 'Shared', 50],
  ['statement credit', 'card', 'in', 'expense', 'Card credits & rewards', 'Shared', 50],
  // Ads
  ['facebook', null, 'out', 'expense', 'Advertising', 'Shirt School', 60],
  ['facebk', null, 'out', 'expense', 'Advertising', 'Shirt School', 60],
  ['meta platforms', null, 'out', 'expense', 'Advertising', 'Shirt School', 60],
]

function matches(rule, tx, account) {
  const text = `${tx.payee || ''} ${tx.description || ''}`.toLowerCase()
  if (!text.includes(rule.pattern.toLowerCase())) return false
  if (rule.account_kind && rule.account_kind !== accountKind(account)) return false
  if (rule.direction === 'in' && tx.amount_cents <= 0) return false
  if (rule.direction === 'out' && tx.amount_cents >= 0) return false
  return true
}

// Returns the fields a rule sets, or null. Rules must be sorted by priority.
export function applyRules(tx, account, rules) {
  const rule = rules.find((r) => matches(r, tx, account))
  if (!rule) return null
  return { kind: rule.kind, category: rule.category, business: rule.business, rule_id: rule.id, status: 'rule' }
}
