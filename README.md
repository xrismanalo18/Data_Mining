# Process Mining Platform for Vercel

Vercel-ready version of the local process mining prototype.

## Stack

- Next.js App Router
- Vercel server functions
- Supabase Postgres via server-side `POSTGRES_URL`
- Optional public Supabase settings via `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Optional Vercel Blob via `BLOB_READ_WRITE_TOKEN`
- Excel/CSV parsing with `xlsx`

## Local Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `POSTGRES_URL` to your Supabase Postgres connection string. The public Supabase URL/key can be added too, but they do not replace `POSTGRES_URL` for backend storage.

## Deploy

```bash
vercel
vercel --prod
```

Add environment variables in Vercel:

- `POSTGRES_URL` from Supabase project settings. Use the pooled URI for serverless deployments when available, usually port `6543`. The app also accepts `DATABASE_URL` or `SUPABASE_POSTGRES_URL`.
- `NEXT_PUBLIC_SUPABASE_URL`, for example `https://cjwihqfdpimyhhrvfpcz.supabase.co`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, your Supabase publishable key
- `BLOB_READ_WRITE_TOKEN` optional, for storing original uploaded files

Important: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe public settings. They are not enough for this app's upload API because the API creates schema objects and inserts normalized event-log rows into `"Data_mining"`. Keep `POSTGRES_URL` server-only and never expose it in client code.

## Data Flow

Upload file -> parse rows -> preview mapping -> confirm -> store only normalized event-log fields in Supabase table `"Data_mining"` -> analyze from Postgres.

The original Excel content is not stored in `"Data_mining"`. Only fields required for process mining are stored:

- `dataset_id`
- `dataset_name`
- `original_filename`
- `row_number`
- `case_id`
- `activity`
- `event_ts`
- `resource`
- `cost`
- `attrs` JSONB for object IDs and supporting attributes

## Supabase Schema

The Supabase schema is versioned in `supabase/migrations/20260616000100_process_mining_schema.sql`.

This migration creates the `Data_mining` analysis table plus the supporting `datasets`, `upload_sessions`, and `action_rules` tables. Do not commit `POSTGRES_URL` or database passwords to GitHub; keep them in Vercel Environment Variables.
