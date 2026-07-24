import { NextResponse } from "next/server";
import { z } from "zod";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { analyzeQuickBottleneck, type BottleneckMapping } from "@/lib/quick-bottleneck";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    const preview = await query<{ filename: string; blob_url: string | null; headers: string[]; rows: Record<string, unknown>[] }>(
      "select filename, blob_url, headers, rows from upload_sessions where id = $1 and name = $2",
      [input.uploadId, "Quick Bottleneck Analysis"],
    );
    const source = preview.rows[0];
    if (!source) return NextResponse.json({ error: "Bottleneck upload preview not found." }, { status: 404 });

    const validHeaders = new Set(source.headers);
    for (const value of Object.values(input.mapping)) {
      if (value && !validHeaders.has(value)) return NextResponse.json({ error: `Mapped column not found: ${value}` }, { status: 400 });
    }
    const sourceRows = source.blob_url ? await parseBlobRows(source.blob_url, source.filename) : source.rows;
    const analysis = analyzeQuickBottleneck(sourceRows, input.mapping as BottleneckMapping);
    await query("delete from upload_sessions where id = $1", [input.uploadId]);
    return NextResponse.json({ filename: source.filename, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bottleneck analysis failed.";
    const status = /Select the|Select WQDF|Mapped column/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function parseBlobRows(blobUrl: string, filename: string) {
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error("The original Quick Bottleneck workbook could not be read.");
  const file = new File([await response.arrayBuffer()], filename, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
  return (await parseUploadedFile(file)).rows;
}
