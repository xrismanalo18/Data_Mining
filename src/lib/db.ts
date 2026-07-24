import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let initialized = false;

function getDatabaseConnectionEntry() {
  const candidates = [
    // Keep the app-owned override ahead of provider-managed variables, which
    // may retain stale credentials after a Supabase database password reset.
    ["PROCESS_MINING_DATABASE_URL", process.env.PROCESS_MINING_DATABASE_URL],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["SUPABASE_POSTGRES_URL", process.env.SUPABASE_POSTGRES_URL],
    ["SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL],
    ["SUPABASE_DB_URL", process.env.SUPABASE_DB_URL],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
  ] as const;

  return candidates.find(([, value]) => value?.trim()) || (["", ""] as const);
}

function getDatabaseConnectionString() {
  return getDatabaseConnectionEntry()[1]?.trim() || "";
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

function normalizeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    for (const param of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getPool() {
  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error(
      "Database connection is not configured. Set PROCESS_MINING_DATABASE_URL or POSTGRES_URL to your Supabase pooled Postgres URI, or expose a compatible database URL such as DATABASE_URL, SUPABASE_POSTGRES_URL, SUPABASE_DATABASE_URL, SUPABASE_DB_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL_NON_POOLING. " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are public client settings and cannot save uploads by themselves." +
        getSupabaseProjectHint(),
    );
  }

  if (!pool) {
    const normalizedConnectionString = normalizeConnectionString(connectionString);
    const isLocal = normalizedConnectionString.includes("localhost") || normalizedConnectionString.includes("127.0.0.1");
    pool = new Pool({
      connectionString: normalizedConnectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
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

    create table if not exists "Data_mining" (
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

    alter table "Data_mining" add column if not exists dataset_id uuid;
    alter table "Data_mining" add column if not exists dataset_name text;
    alter table "Data_mining" add column if not exists original_filename text;
    alter table "Data_mining" add column if not exists row_number integer;
    alter table "Data_mining" add column if not exists case_id text;
    alter table "Data_mining" add column if not exists activity text;
    alter table "Data_mining" add column if not exists event_ts timestamptz;
    alter table "Data_mining" add column if not exists resource text;
    alter table "Data_mining" add column if not exists cost numeric;
    alter table "Data_mining" add column if not exists attrs jsonb default '{}'::jsonb;
    alter table "Data_mining" add column if not exists created_at timestamptz default now();

    create index if not exists data_mining_dataset_case_idx on "Data_mining"(dataset_id, case_id, event_ts);
    create index if not exists data_mining_dataset_activity_idx on "Data_mining"(dataset_id, activity);
    create index if not exists data_mining_created_idx on "Data_mining"(created_at);

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
