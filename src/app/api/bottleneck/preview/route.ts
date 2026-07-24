import { NextResponse } from "next/server";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { detectBottleneckMapping } from "@/lib/quick-bottleneck";
import { readWorkbookUpload } from "@/lib/uploaded-workbook";

export const runtime = "nodejs";
export const maxDuration = 300;

const PREVIEW_ROW_LIMIT = 1_000;

export async function POST(request: Request) {
  try {
    const upload = await readWorkbookUpload(request, "Quick Bottleneck Analysis");
    const { file } = upload;

    const parsed = await parseUploadedFile(file);
    const mapping = detectBottleneckMapping(parsed.headers, parsed.rows);
    // Quick Bottleneck is a replace-in-place workspace. Remove abandoned or
    // previous previews before storing the newly uploaded template.
    await query("delete from upload_sessions where name = $1", ["Quick Bottleneck Analysis"]);
    const result = await query<{ id: string }>(
      `insert into upload_sessions (name, filename, blob_url, headers, rows, detected_mapping)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       returning id`,
      [
        "Quick Bottleneck Analysis",
        file.name,
        upload.blobUrl,
        JSON.stringify(parsed.headers),
        JSON.stringify(upload.blobUrl ? parsed.rows.slice(0, PREVIEW_ROW_LIMIT) : parsed.rows),
        JSON.stringify(mapping),
      ],
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
