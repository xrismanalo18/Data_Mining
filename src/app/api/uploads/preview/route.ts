import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { detectMapping } from "@/lib/process-mining";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "Uploaded Event Log");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a CSV or Excel file." }, { status: 400 });
    }

    const parsed = await parseUploadedFile(file);
    const detected = detectMapping(parsed.headers);
    let blobUrl: string | null = null;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`process-uploads/${Date.now()}-${file.name}`, file, {
        access: "public",
        addRandomSuffix: true,
      });
      blobUrl = blob.url;
    }

    const result = await query<{ id: string }>(
      `insert into upload_sessions (name, filename, blob_url, headers, rows, detected_mapping)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       returning id`,
      [name, file.name, blobUrl, JSON.stringify(parsed.headers), JSON.stringify(parsed.rows), JSON.stringify(detected)],
    );

    return NextResponse.json({
      uploadId: result.rows[0].id,
      name,
      filename: file.name,
      rowCount: parsed.rows.length,
      headers: parsed.headers,
      detectedMapping: detected,
      sampleRows: parsed.rows.slice(0, 8),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload preview failed." },
      { status: 500 },
    );
  }
}
