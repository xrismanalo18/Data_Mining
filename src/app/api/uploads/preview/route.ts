import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { detectMapping } from "@/lib/process-mining";
import { readWorkbookUpload } from "@/lib/uploaded-workbook";

export const runtime = "nodejs";
export const maxDuration = 300;

const PREVIEW_ROW_LIMIT = 1_000;

export async function POST(request: Request) {
  try {
    const upload = await readWorkbookUpload(request, "Uploaded Event Log");
    const { file, name } = upload;

    const parsed = await parseUploadedFile(file);
    const detected = detectMapping(parsed.headers, parsed.rows);
    let blobUrl = upload.blobUrl;
    if (!blobUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`process-uploads/${Date.now()}-${file.name}`, file, {
        access: "public",
        addRandomSuffix: true,
      });
      blobUrl = blob.url;
    }

    // Only one main upload can be pending. Clearing abandoned previews keeps
    // large JSON workbooks from accumulating in PostgreSQL.
    await query("delete from upload_sessions where name <> $1", ["Quick Bottleneck Analysis"]);
    const result = await query<{ id: string }>(
      `insert into upload_sessions (name, filename, blob_url, headers, rows, detected_mapping)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       returning id`,
      [
        name,
        file.name,
        blobUrl,
        JSON.stringify(parsed.headers),
        JSON.stringify(blobUrl ? parsed.rows.slice(0, PREVIEW_ROW_LIMIT) : parsed.rows),
        JSON.stringify(detected),
      ],
    );

    return NextResponse.json({
      uploadId: result.rows[0].id,
      name,
      filename: file.name,
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRow,
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
