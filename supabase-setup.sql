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
  notes           text,
  created_at      timestamptz not null default now()
);

alter table ai_feedback disable row level security;

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
  slack_ts     text,
  created_at   timestamptz not null default now()
);
alter table content_briefs disable row level security;

-- Generated and saved content ideas
create table if not exists content_ideas (
  id           uuid primary key,
  brief_id     uuid references content_briefs(id),
  format       text not null,  -- 'short' | 'long'
  title        text not null,
  hook         text,
  outline      text,
  why_timely   text,
  notes        text,
  status       text not null default 'generated',  -- 'generated' | 'saved' | 'filmed' | 'deleted'
  calendar_date date,
  created_at   timestamptz not null default now()
);
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
