import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { analyze, type EventRow } from "@/lib/process-mining";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const dataset = await query("select * from datasets where id = $1", [id]);
    if (!dataset.rows[0]) return NextResponse.json({ error: "Dataset not found." }, { status: 404 });

    const events = await query<{
      case_id: string;
      activity: string;
      event_ts: string;
      resource: string | null;
      cost: string | null;
      attrs: Record<string, string>;
    }>(
      `select case_id, activity, event_ts, resource, cost, attrs
       from "Data_Mining"
       where dataset_id = $1
       order by case_id, event_ts`,
      [id],
    );
    const eventRows: EventRow[] = events.rows.map(row => ({
      caseId: row.case_id,
      activity: row.activity,
      timestamp: new Date(row.event_ts).toISOString(),
      resource: row.resource,
      cost: row.cost === null ? null : Number(row.cost),
      attrs: row.attrs || {},
    }));

    const rules = await query("select * from action_rules where dataset_id = $1 order by created_at desc", [id]);
    return NextResponse.json({
      dataset: dataset.rows[0],
      analysis: analyze(eventRows),
      actionRules: rules.rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to analyze dataset." },
      { status: 500 },
    );
  }
}
