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
