-- P&L dashboard tables (2026-10-20). Safe to re-run.
-- Bank tables have row-level security ON with no policies: only the server's
-- service-role key can read them. Personal accounts are never stored beyond a
-- name row with is_business = false (no balance, no transactions).

create table if not exists bank_accounts (
  id text primary key,                    -- SimpleFIN account id
  institution text,
  name text,
  is_business boolean not null default false,
  balance_cents bigint,
  balance_at timestamptz,
  last_synced_at timestamptz,
  newest_posted_on date,
  created_at timestamptz not null default now()
);

create table if not exists bank_transactions (
  id text primary key,                    -- SimpleFIN txn id, or csv:<hash> for imports
  account_id text not null references bank_accounts(id),
  posted_on date not null,
  amount_cents bigint not null,           -- negative = money out
  description text,
  payee text,
  pending boolean not null default false,
  kind text,                              -- expense | revenue | payout | refund | transfer | owner_draw | ignore | null (unsorted)
  category text,
  business text,                          -- Shirt School | Elite | Drop Studio | Brand Brain | Consulting | Shared
  status text not null default 'review',  -- rule | suggested | review | confirmed
  rule_id uuid,
  note text,
  source text not null default 'simplefin', -- simplefin | csv
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bank_tx_posted on bank_transactions(posted_on desc);
create index if not exists idx_bank_tx_status on bank_transactions(status);

create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,                  -- case-insensitive "contains" match on payee + description
  account_kind text,                      -- 'bank' | 'card' | null = any
  direction text,                         -- 'in' | 'out' | null = any
  kind text not null,
  category text,
  business text,
  priority int not null default 100,      -- lower runs first
  created_by text not null default 'eddie',
  created_at timestamptz not null default now()
);

-- Stripe fees and refunds, one row per Stripe balance transaction
create table if not exists processor_adjustments (
  id text primary key,                    -- Stripe balance transaction id (+ ':fee' for fees)
  processor text not null,                -- 'stripe'
  occurred_on date not null,
  kind text not null,                     -- fee | refund | dispute
  amount_cents bigint not null,           -- negative = cost
  business text,
  description text,
  charge_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_proc_adj_on on processor_adjustments(occurred_on desc);

-- Manual business override for a revenue line (rules decide when null)
alter table revenue_entries add column if not exists business text;

alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
alter table category_rules enable row level security;
alter table processor_adjustments enable row level security;

-- Small key/value store (last report sent, last Stripe sync…)
create table if not exists pnl_state (key text primary key, value text, updated_at timestamptz not null default now());
alter table pnl_state enable row level security;
