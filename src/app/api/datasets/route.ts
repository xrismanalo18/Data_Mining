import { NextResponse } from "next/server";

import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await query(
      `select d.id, d.name, d.original_filename, d.created_at,
              count(dm.id)::int as event_count,
              count(distinct dm.case_id)::int as case_count
       from datasets d
       left join "Data_mining" dm on dm.dataset_id = d.id
       group by d.id
       order by d.created_at desc`,
    );
    return NextResponse.json({ datasets: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load datasets." },
      { status: 500 },
    );
  }
}
