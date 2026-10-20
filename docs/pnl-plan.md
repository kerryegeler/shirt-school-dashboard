# P&L Dashboard — Build Plan (draft for Kerry's approval)

Written 2026-10-20. Turns the **Sales Analytics** page into a **Profit & Loss** page inside the existing Shirt School Dashboard (Railway + existing Supabase). No new hosting costs; SimpleFIN Bridge is $15/yr.

## Goal
Open the dashboard any day and see, as current as the data allows:
- Profit, revenue and expenses this month so far, and each month this year
- Expenses by category, and everything filterable by business
- A one-click export for the CPA

## Data sources
| What | Source | How fresh |
|---|---|---|
| Stripe + Kajabi sales | Existing webhooks into `revenue_entries` (unchanged) | Live |
| Bank + card transactions | SimpleFIN Bridge (connected 2026-10-20, read-only) | MidFirst: same day incl. pending. Capital One: ~1 day. Amex/Chase: as posted |
| Impact, AdSense/YouTube, sponsors, other deposits | Bank deposits from MidFirst Business Checking | Same day |
| Card purchase alert emails (later, optional) | Gmail filter + label | Minutes |

## Accounts in scope (business only)
- MidFirst FREE BUSINESS CHECKING (5866)
- Capital One Spark Cash (5535)
- Amex Business Platinum (1008)
- Amex Business Gold (2006)
- Chase Ink (8932)

The MidFirst login also shows personal accounts (LiveFree Checking 6562, Performance Savings 8821, Auto Loan 4460). **They are skipped at sync time and never stored.** Only accounts on an allowlist are saved.

## How the money is counted (no double-counting)
| Bank/card line | Treated as |
|---|---|
| Stripe sale / Kajabi sale (from webhooks) | **Revenue** (gross) |
| "Stripe" / "On Behalf of Kaj…" deposits in business checking | **Payout**: matched to sales already counted, not counted again |
| Other deposits (Impact, AdSense, sponsors…) | **Revenue**, saved to `revenue_entries` as `bank_deposit`/`impact`/`adsense` (those sources already exist in the table) |
| Card charges, bank debits | **Expense**, with a category + business |
| Card payments ("Payment", "Credit Card Payment"), moves between business accounts | **Transfer**: ignored |
| Business checking → personal | **Owner draw**: shown separately, not an expense |
| Card interest, annual/statement fees | **Expense** (Bank & interest) |
| Refunds/credits on cards | Reduce that category's expenses |
| Stripe/Kajabi processing fees | **Expense** (Payment processing). Stripe fees pulled from Stripe; Kajabi fees to be confirmed during build |

## Revenue by business and product (Kerry, 2026-10-20)
Every revenue line gets a **business** and a cleaned-up **product** name, so the page filters by either.

**Businesses:** Shirt School · Shirt School Elite · Drop Studio · Brand Brain · Consulting

| Revenue | Business |
|---|---|
| Any Kajabi product with **"Elite"** in the name: "Shirt School + Elite Coaching" ($297/mo, $99, $247, $197 "Elite", pay-in-full), "Shirt School Elite Membership" ($99/$119/$197) | **Elite** |
| Brand Builders Accelerator ($197/mo), Shirt School Implementation Program ($197, $945/$995) | **Shirt School** |
| 5-Day Challenge ($5/$7 tickets), VIP Experience ($37–$67), Replay Videos | **Shirt School** |
| Impact, AdSense/YouTube, PartnerStack, PayPal, other affiliate deposits | **Shirt School** (default; can be changed per line) |
| Stripe "The Brand Brain Install", "Brand Brain" | **Brand Brain** |
| Stripe subscriptions ($14.99 / $29.99 etc.) | **Drop Studio** |
| Stripe invoices / "Serve-First Accelerator" / retainers ("March 1-15") | **Consulting** (confirmed) |

Product names are cleaned up (Kajabi sends some with and without quotes, so they're merged). Every line can be re-tagged by hand, and the rules are easy to change.

**Data check (2026-10-20):** `revenue_entries` already holds revenue back to June 2025 (2,624 entries in 2026), so the year's revenue growth is available now. Two "Kajabi Backfill" lump entries (Mar 31: $14,285; Apr 30: $20,781) have no product. They'll be checked so they aren't double-counted and are split by product if possible.

## Expense categories (CPA-friendly, Schedule C style)
Advertising · Software & subscriptions · Contractors & freelancers · Payment processing fees · Product & printing costs · Education & coaching · Professional fees (legal/CPA) · Travel · Meals · Office & equipment · Phone & internet · Bank fees & interest · Taxes & licenses · Other. Plus non-P&L buckets: Transfer, Owner draw, Personal (in case a personal charge lands on a business card).

Each expense also gets a **business** (same list as revenue below, plus **Shared** for costs that serve everything).

## Sorting
1. **Rules first**: "description contains X → category + business" (e.g. "Facebook ads" → Advertising / Shirt School).
2. **One-time first pass by Eddie**: categorize all history, create the rules, and give Kerry a short summary to check.
3. **New, unknown merchants** land in a small **Needs review** list. Picking a category there saves a rule, so it's automatic next time.
No AI API calls inside the dashboard (keeps it free and matches the retired-AI decision).

## Sync
- Server pulls SimpleFIN every 4 hours (well within SimpleFIN's limits) plus a **Sync now** button.
- Pending items are replaced when they post (no duplicates).
- A freshness line on the page: e.g. "Banks synced 2h ago · newest Amex charge Oct 7".
- If a bank connection breaks, the page shows it and Eddie posts to Slack.

## History (Kerry wants all of 2026)
Revenue: already in `revenue_entries`. Expenses: SimpleFIN gives roughly the last 90 days; for **Jan–Jul 2026**, a one-time CSV download from each of the 4 card/bank sites (Eddie via Chrome, or Kerry) is imported, with duplicates removed where it overlaps.

## Look and feel (Kerry, 2026-10-20)
A step up from the old dashboard: dark, modern, a little futuristic, very easy to use.
- Dark background with one fresh accent palette (not tied to the old colors), soft glows, clean type, big readable numbers
- Smooth motion: numbers count up, charts draw in, panels slide/fade; nothing slow or distracting
- **Desktop first** (where Kerry looks most), and it must also look great on the phone
- Before wiring it to live data, Eddie shows a **static design mock** (desktop + phone screenshots) for Kerry's OK
- Lives inside the dashboard but gets its own styles, so the rest of the dashboard isn't affected

## The page (replaces Sales Analytics; current revenue views are kept)
- **Overview**: 3 tiles (Revenue, Expenses, Profit, month to date) · revenue vs expenses vs profit by month this year · expenses by category · business filter (All / Shirt School / Elite / Drop Studio / Brand Brain / Consulting) · freshness line
- **Revenue**: revenue by business and by product (e.g. Elite vs non-Elite, challenge tickets, VIP), plus the current Sales Analytics views
- **Expenses**: searchable list, edit category/business inline
- **Needs review**: uncategorized items
- **Export**: pick a date range → CSV/Excel of (1) every transaction with category, (2) P&L by month and category

## Reports
Server posts a short summary to Slack: weekly (Monday) and monthly (on the 1st). No AI needed; same numbers as the page.

## Database (existing Supabase project)
New tables: `bank_accounts`, `bank_transactions`, `category_rules`. Add a `business` column to `revenue_entries`. **Row-level security on** for the bank tables; the server reads them with the Supabase service key.

## Access status
- Supabase: the dashboard's project URL + anon key copied from Railway into the local `.env` (2026-10-20). Read access verified.
- Before go-live, Kerry adds two values in **Railway → Variables**: `SIMPLEFIN_ACCESS_URL` (copied from the Mac's `.env`) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API), which also goes in the local `.env` for testing.
- Kerry approves this plan, the design mock, and the finished page before it goes live.

## Build order
0. Design mock (desktop + phone) → Kerry's OK
1. Tables + SimpleFIN sync + counting rules (local test; compare one month to the bank statement)
2. Eddie's first categorization pass → Kerry checks the summary
3. The P&L page (screenshots at desktop + phone width before going live)
4. Export + Slack reports
5. Jan–Jul CSV import
6. (Optional, later) card alert emails for minute-level expenses

## Decisions (Kerry, 2026-10-20)
- Revenue shown gross; processing fees are an expense.
- "Elite" in the Kajabi product name = Elite; all other Kajabi = Shirt School.
- Stripe invoices, Serve-First Accelerator and retainer payments = Consulting.
- All of 2026 included (expenses Jan–Jul via one-time CSV import).
- Only the 5 business accounts are stored; personal accounts are never saved.

## Build status (2026-10-20, end of day)
Built and tested locally on real data; **not deployed**.
- Tables created in Supabase (`docs/pnl-migration.sql`). Service key in local `.env`.
- First sync: 6 business accounts incl. U.S. Bank Business Credit Card (1360); personal accounts not stored. 2026 Stripe fees/refunds pulled.
- Eddie's first sort (`scripts/pnl-first-sort.mjs`): 80 merchant rules; 32 gas/meal lines "suggested"; 14 lines left for Kerry.
- Kerry: no Slack summaries (removed). Dashboard login: kerry@shirtschool.com (only email allowed on the P&L).
- Kajabi check vs Kajabi's report: Jul–Oct exact; May/Jun within $95; **Jan ($2,127) and Feb ($1,707) missing**; Mar/Apr are "Kajabi Backfill" lumps (no product). Proposed: replace lumps with per-product monthly totals from Kajabi (needs Kerry's OK, since it deletes 2 rows).
- Still to do: Kerry's OK → Railway vars (SIMPLEFIN_ACCESS_URL, SUPABASE_SERVICE_ROLE_KEY) → deploy; Jan–Jul card/bank CSV import.
