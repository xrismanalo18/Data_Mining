import { NextResponse } from "next/server";
import { z } from "zod";

import { query } from "@/lib/db";
import { analyzeQuickBottleneck, type BottleneckMapping } from "@/lib/quick-bottleneck";

export const runtime = "nodejs";
export const maxDuration = 60;

const InputSchema = z.object({
  uploadId: z.string().uuid(),
  mapping: z.object({
    claim_id: z.string(),
    event_name: z.string(),
    comments: z.string(),
    event_timestamp: z.string(),
    received_date: z.string(),
    paid_date: z.string(),
    amount: z.string(),
  }),
});

export async function POST(request: Request) {
  try {
    const input = InputSchema.parse(await request.json());
    const preview = await query<{ filename: string; headers: string[]; rows: Record<string, unknown>[] }>(
      "select filename, headers, rows from upload_sessions where id = $1 and name = $2",
      [input.uploadId, "Quick Bottleneck Analysis"],
    );
    const source = preview.rows[0];
    if (!source) return NextResponse.json({ error: "Bottleneck upload preview not found." }, { status: 404 });

    const validHeaders = new Set(source.headers);
    for (const value of Object.values(input.mapping)) {
      if (value && !validHeaders.has(value)) return NextResponse.json({ error: `Mapped column not found: ${value}` }, { status: 400 });
    }
    const analysis = analyzeQuickBottleneck(source.rows, input.mapping as BottleneckMapping);
    await query("delete from upload_sessions where id = $1", [input.uploadId]);
    return NextResponse.json({ filename: source.filename, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bottleneck analysis failed.";
    const status = /Select the|Select WQDF|Mapped column/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
