import { NextResponse } from "next/server";
import { z } from "zod";

import { query } from "@/lib/db";

export const runtime = "nodejs";

const RuleSchema = z.object({
  datasetId: z.string().uuid(),
  name: z.string().min(1).max(200),
  conditionType: z.string().min(1).max(80),
  threshold: z.number(),
  target: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  try {
    const input = RuleSchema.parse(await request.json());
    await query(
      `insert into action_rules (dataset_id, name, condition_type, threshold, target)
       values ($1, $2, $3, $4, $5)`,
      [input.datasetId, input.name, input.conditionType, input.threshold, input.target],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save action rule." },
      { status: 500 },
    );
  }
}
