// One-off: Eddie's first sorting pass (2026-10-20). Confident merchants become rules;
// gas/meals/odd ones become "suggested" for Kerry to confirm in Needs review.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { reapplyRules } from '../pnl/index.js'
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SW = 'Software & subscriptions'
// [pattern, category, business]  — card charges, any direction (refunds offset)
const RULES = [
  ['colinboyd', 'Education & coaching', 'Shared'],
  ['simpletexting', SW, 'Shirt School'], ['kajabi', SW, 'Shirt School'], ['kit.com', SW, 'Shirt School'],
  ['zoom.com', SW, 'Shirt School'], ['manychat', SW, 'Shirt School'], ['vidiq', SW, 'Shirt School'],
  ['fal features', SW, 'Drop Studio'], ['google cloud', SW, 'Shared'], ['anthropic', SW, 'Shared'],
  ['highlevel', SW, 'Shared'], ['google workspace', SW, 'Shared'], ['zapier', SW, 'Shared'],
  ['supabase', SW, 'Shared'], ['clicksend', SW, 'Shared'], ['resend', SW, 'Shared'], ['ecamm', SW, 'Shared'],
  ['descript', SW, 'Shared'], ['railway', SW, 'Shared'], ['dropbox', SW, 'Shared'], ['plausible', SW, 'Shared'],
  ['omnisend', SW, 'Shared'], ['calendly', SW, 'Shared'], ['bonjoro', SW, 'Shared'], ['name-cheap', SW, 'Shared'],
  ['slack', SW, 'Shared'], ['superwhisper', SW, 'Shared'], ['openai', SW, 'Shared'], ['x corp. paid', SW, 'Shared'],
  ['bunnycdn', SW, 'Shared'], ['google one', SW, 'Shared'], ['trello', SW, 'Shared'], ['google*g1ai', SW, 'Shared'],
  ['etsy', SW, 'Shared'], ['shopify', SW, 'Shared'],
  ['gelato', 'Product & printing', 'Shirt School'],
  ['american express travel', 'Travel', 'Shared'], ['amextravel', 'Travel', 'Shared'], ['southwes', 'Travel', 'Shared'],
  ['lyft', 'Travel', 'Shared'], ['uber', 'Travel', 'Shared'], ['clearme', 'Travel', 'Shared'], ['uahotel', 'Travel', 'Shared'],
  ['hotel', 'Travel', 'Shared'], ['htlbiz', 'Travel', 'Shared'], ['super.com', 'Travel', 'Shared'], ['laz parking', 'Travel', 'Shared'],
  ['best western', 'Travel', 'Shared'], ['travel@ease', 'Travel', 'Shared'],
  ['amex clear plus credit', 'Card credits & rewards', 'Shared'],
]
// Suggestions only (could be personal): gas → Travel, food → Meals
const SUGGEST = [
  ...["buc-ee", 'wawa', "love's", 'casey', 'arco', 'weigel'].map((p) => [p, 'Travel']),
  ...['mellow mushroom', 'bojangles', "mcdonald", 'smashburger', 'whole foods', 'wholefds', 'qdoba', 'chipotle', 'dairy queen',
    'moonshine', 'chick-fil-a', "wendy", 'whataburger', 'jack in the box', 'doordash', 'sticks and stones', 'hudson', 'newslink',
    'capitol theatre', 'new stand', 'hyatt regency hb f&b'].map((p) => [p, 'Meals']),
]

const { data: existing } = await sb.from('category_rules').select('pattern,account_kind')
const have = new Set(existing.map((r) => `${r.pattern}|${r.account_kind}`))
const rows = RULES.filter(([p]) => !have.has(`${p}|card`)).map(([pattern, category, business]) =>
  ({ pattern, account_kind: 'card', direction: null, kind: 'expense', category, business, priority: 60, created_by: 'eddie' }))
if (rows.length) await sb.from('category_rules').insert(rows)
console.log('rules added', rows.length, '· lines re-sorted', await reapplyRules())

let suggested = 0
const { data: review } = await sb.from('bank_transactions').select('id,payee,description').eq('status', 'review')
for (const t of review) {
  const text = `${t.payee} ${t.description}`.toLowerCase()
  const hit = SUGGEST.find(([p]) => text.includes(p))
  if (!hit) continue
  await sb.from('bank_transactions').update({ kind: 'expense', category: hit[1], business: 'Shared', status: 'suggested' }).eq('id', t.id)
  suggested++
}
const { data: left } = await sb.from('bank_transactions').select('payee').eq('status', 'review')
console.log('suggested', suggested, '· still for Kerry', left.length, [...new Set(left.map((r) => r.payee))].join(', '))
