import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let initialized = false;

function getDatabaseConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_POSTGRES_URL ||
    ""
  ).trim();
}

function getSupabaseProjectHint() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "";

  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    if (!projectRef || projectRef === hostname) return "";
    return ` Supabase project detected: ${projectRef}. Add its pooled Postgres URI as POSTGRES_URL.`;
  } catch {
    return "";
  }
}

export function getPool() {
  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error(
      "Database connection is not configured. Set POSTGRES_URL to your Supabase pooled Postgres URI. " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are public client settings and cannot save uploads by themselves." +
        getSupabaseProjectHint(),
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function ensureSchema() {
  if (initialized) return;
  const database = getPool();
  await database.query(`
    create extension if not exists pgcrypto;

    create table if not exists datasets (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      original_filename text,
      blob_url text,
      mapping jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists "Data_Mining" (
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

    alter table "Data_Mining" add column if not exists dataset_id uuid;
    alter table "Data_Mining" add column if not exists dataset_name text;
    alter table "Data_Mining" add column if not exists original_filename text;
    alter table "Data_Mining" add column if not exists row_number integer;
    alter table "Data_Mining" add column if not exists case_id text;
    alter table "Data_Mining" add column if not exists activity text;
    alter table "Data_Mining" add column if not exists event_ts timestamptz;
    alter table "Data_Mining" add column if not exists resource text;
    alter table "Data_Mining" add column if not exists cost numeric;
    alter table "Data_Mining" add column if not exists attrs jsonb default '{}'::jsonb;
    alter table "Data_Mining" add column if not exists created_at timestamptz default now();

    create index if not exists data_mining_dataset_case_idx on "Data_Mining"(dataset_id, case_id, event_ts);
    create index if not exists data_mining_dataset_activity_idx on "Data_Mining"(dataset_id, activity);
    create index if not exists data_mining_created_idx on "Data_Mining"(created_at);

    create table if not exists upload_sessions (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      filename text not null,
      blob_url text,
      headers jsonb not null,
      rows jsonb not null,
      detected_mapping jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists action_rules (
      id uuid primary key default gen_random_uuid(),
      dataset_id uuid not null references datasets(id) on delete cascade,
      name text not null,
      condition_type text not null,
      threshold numeric not null,
      target text not null,
      created_at timestamptz not null default now()
    );
  `);
  initialized = true;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  await ensureSchema();
  return getPool().query<T>(text, params);
}
