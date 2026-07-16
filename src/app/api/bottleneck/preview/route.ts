import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { detectBottleneckMapping } from "@/lib/quick-bottleneck";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Upload a CSV or Excel file." }, { status: 400 });

    const parsed = await parseUploadedFile(file);
    const mapping = detectBottleneckMapping(parsed.headers, parsed.rows);
    const result = await query<{ id: string }>(
      `insert into upload_sessions (name, filename, blob_url, headers, rows, detected_mapping)
       values ($1, $2, null, $3::jsonb, $4::jsonb, $5::jsonb)
       returning id`,
      ["Quick Bottleneck Analysis", file.name, JSON.stringify(parsed.headers), JSON.stringify(parsed.rows), JSON.stringify(mapping)],
    );

    return NextResponse.json({
      uploadId: result.rows[0].id,
      filename: file.name,
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
      rowCount: parsed.rows.length,
      headers: parsed.headers,
      detectedMapping: mapping,
      sampleRows: parsed.rows.slice(0, 5),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bottleneck preview failed." }, { status: 500 });
  }
}
