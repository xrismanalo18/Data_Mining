create extension if not exists pgcrypto;

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  original_filename text,
  blob_url text,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public."Data_mining" (
  id bigserial primary key,
  dataset_id uuid not null,
  dataset_name text not null,
  original_filename text,
  row_number integer not null,
  case_id text not null,
  activity text not null,
  event_ts timestamptz not null,
  resource text,
  cost numeric,
  attrs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public."Data_mining" add column if not exists dataset_id uuid;
alter table public."Data_mining" add column if not exists dataset_name text;
alter table public."Data_mining" add column if not exists original_filename text;
alter table public."Data_mining" add column if not exists row_number integer;
alter table public."Data_mining" add column if not exists case_id text;
alter table public."Data_mining" add column if not exists activity text;
alter table public."Data_mining" add column if not exists event_ts timestamptz;
alter table public."Data_mining" add column if not exists resource text;
alter table public."Data_mining" add column if not exists cost numeric;
alter table public."Data_mining" add column if not exists attrs jsonb default '{}'::jsonb;
alter table public."Data_mining" add column if not exists created_at timestamptz default now();

create index if not exists data_mining_dataset_case_idx
  on public."Data_mining" (dataset_id, case_id, event_ts);

create index if not exists data_mining_dataset_activity_idx
  on public."Data_mining" (dataset_id, activity);

create index if not exists data_mining_created_idx
  on public."Data_mining" (created_at);

create table if not exists public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filename text not null,
  blob_url text,
  headers jsonb not null,
  rows jsonb not null,
  detected_mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.action_rules (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  name text not null,
  condition_type text not null,
  threshold numeric not null,
  target text not null,
  created_at timestamptz not null default now()
);
