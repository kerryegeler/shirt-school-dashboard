-- Shirt School Dashboard — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- Gmail OAuth tokens (one row per connected account)
create table if not exists gmail_tokens (
  account     text primary key,
  tokens      jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Manual category overrides (when you reclassify a thread)
create table if not exists category_overrides (
  thread_id   text primary key,
  category    text not null,
  updated_at  timestamptz not null default now()
);

-- Custom folders
create table if not exists folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Which thread belongs to which folder
create table if not exists folder_assignments (
  thread_id   text primary key,
  folder_id   uuid not null references folders(id) on delete cascade,
  updated_at  timestamptz not null default now()
);

-- Disable Row Level Security on all tables
-- (this is a private server-side app; the anon key is only used server-side)
alter table gmail_tokens        disable row level security;
alter table category_overrides  disable row level security;
alter table folders             disable row level security;
alter table folder_assignments  disable row level security;

-- Saved reply drafts (persists in-progress replies across sessions)
create table if not exists saved_drafts (
  thread_id   text primary key,
  content     text not null,
  updated_at  timestamptz not null default now()
);

alter table saved_drafts disable row level security;

-- Slack approval workflow (tracks which emails have been posted to Slack)
create table if not exists slack_notifications (
  thread_id        text primary key,
  account          text not null,
  slack_ts         text,           -- Slack message timestamp (for updates)
  channel_id       text,
  status           text not null default 'pending',  -- pending | approved | sent | skipped
  draft            text,
  category         text,
  confidence       text,
  confidence_reason text,
  summary          text,
  thread_meta      jsonb,          -- { from, fromName, to, subject, messageId, threadId, defaultFrom }
  approved_at      timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

alter table slack_notifications disable row level security;

-- AI feedback loop (logs AI draft vs final sent version)
create table if not exists ai_feedback (
  id              uuid primary key default gen_random_uuid(),
  thread_id       text,
  category        text not null,
  original_draft  text not null,
  final_version   text not null,
  diff_summary    text,
  action          text not null default 'edited',  -- 'approved' | 'edited' | 'skipped'
  notes           text,
  created_at      timestamptz not null default now()
);

alter table ai_feedback disable row level security;
-- Run this if the table already exists:
-- alter table ai_feedback add column if not exists action text not null default 'edited';

-- ─── Content Agent ────────────────────────────────────────────────────────────

-- Configurable research topics
create table if not exists content_topics (
  id         uuid primary key default gen_random_uuid(),
  keyword    text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table content_topics disable row level security;

-- Daily brief archive
create table if not exists content_briefs (
  id           uuid primary key,
  run_at       timestamptz not null default now(),
  youtube      jsonb,
  news         jsonb,
  reddit       jsonb,
  tools        jsonb,
  ideas        jsonb,
  channel_stats jsonb,
  competitors  jsonb,
  slack_ts     text,
  created_at   timestamptz not null default now()
);
-- Run this if the table already exists:
-- ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS competitors jsonb;
alter table content_briefs disable row level security;

-- Generated and saved content ideas
create table if not exists content_ideas (
  id             uuid primary key,
  brief_id       uuid references content_briefs(id),
  format         text not null,  -- 'short' | 'long'
  title          text not null,
  hook           text,
  outline        text,
  why_timely     text,
  freshness_score text,
  notes          text,
  status         text not null default 'generated',  -- 'generated' | 'saved' | 'filmed' | 'deleted'
  calendar_date  date,
  created_at     timestamptz not null default now()
);
-- Run this if the table already exists:
-- ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS freshness_score text;
alter table content_ideas disable row level security;

-- Learning preference profile
create table if not exists content_preferences (
  id              uuid primary key default gen_random_uuid(),
  topic_keywords  text[] default '{}',
  preferred_format text,
  save_count      int not null default 0,
  format_counts   jsonb default '{"short":0,"long":0}',
  updated_at      timestamptz not null default now()
);
alter table content_preferences disable row level security;

-- Kerry's YouTube channel stats (refreshed daily)
create table if not exists youtube_channel_stats (
  id               uuid primary key default gen_random_uuid(),
  fetched_at       timestamptz not null default now(),
  channel_id       text,
  channel_name     text,
  subscriber_count bigint,
  view_count       bigint,
  video_count      int,
  top_videos       jsonb,
  recent_videos    jsonb,
  avg_views        bigint
);
alter table youtube_channel_stats disable row level security;

-- Simple key-value config store (e.g. youtube_channel_id)
create table if not exists content_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table content_config disable row level security;

-- Competitor YouTube channels to track
create table if not exists content_competitors (
  id           uuid primary key default gen_random_uuid(),
  channel_id   text not null unique,   -- YouTube channel ID (UC...)
  channel_name text not null,
  handle       text,                   -- @handle (optional)
  thumbnail    text,                   -- thumbnail URL
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table content_competitors disable row level security;

-- ─── Challenge Launcher ───────────────────────────────────────────────────────

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  main_session_time time not null,
  vip_session_time time not null,
  timezone text not null default 'America/Chicago',
  kit_tag_id text,
  kit_tag_name text,
  zoom_webinar_id text,
  zoom_webinar_join_url text,
  zoom_meeting_id text,
  zoom_meeting_join_url text,
  emails_scheduled integer default 0,
  status text not null default 'draft',
  error_log text,
  created_at timestamptz not null default now()
);
alter table challenges disable row level security;

create table if not exists challenge_email_templates (
  id uuid primary key default gen_random_uuid(),
  sort_order integer not null,
  subject text not null,
  body_html text not null,
  relative_day integer not null,
  send_time time not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table challenge_email_templates disable row level security;

-- ─── Payment Recovery ─────────────────────────────────────────────────────────

create table if not exists kajabi_payments (
  id uuid primary key default gen_random_uuid(),
  kajabi_id text unique not null,
  type text,                        -- 'subscription' | 'payment_plan' | 'one_time'
  status text,                      -- 'failed' | 'success' | 'pending' | 'refunded'
  customer_email text,
  customer_name text,
  customer_kajabi_id text,
  amount_cents integer,
  currency text default 'USD',
  product_name text,
  failed_at timestamptz,
  raw_data jsonb,
  synced_at timestamptz not null default now()
);
alter table kajabi_payments disable row level security;
create index if not exists idx_kajabi_payments_status on kajabi_payments(status, failed_at desc);
create index if not exists idx_kajabi_payments_email on kajabi_payments(customer_email);
alter table kajabi_payments add column if not exists slack_notified_at timestamptz;
alter table kajabi_payments add column if not exists ignored boolean not null default false;
alter table kajabi_payments add column if not exists slack_message_ts text;
alter table kajabi_payments add column if not exists slack_channel_id text;

create table if not exists payment_recovery_sequences (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references kajabi_payments(id),
  customer_email text not null,
  customer_name text,
  product_name text,
  started_at timestamptz not null default now(),
  status text not null default 'active',  -- 'active' | 'paid' | 'cancelled' | 'revocation_needed' | 'revoked'
  notes text,
  updated_at timestamptz not null default now()
);
alter table payment_recovery_sequences disable row level security;
create index if not exists idx_recovery_sequences_status on payment_recovery_sequences(status);
create index if not exists idx_recovery_sequences_email on payment_recovery_sequences(customer_email);

create table if not exists payment_recovery_emails (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references payment_recovery_sequences(id) on delete cascade,
  step integer not null,                  -- 1, 2, 3
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  subject text,
  body text,
  status text not null default 'pending', -- 'pending' | 'sent' | 'failed' | 'cancelled'
  error_message text
);
alter table payment_recovery_emails disable row level security;
create index if not exists idx_recovery_emails_due on payment_recovery_emails(scheduled_for, status);
