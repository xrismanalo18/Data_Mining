import { NextResponse } from "next/server";
import { z } from "zod";

import { query } from "@/lib/db";
import { parseUploadedFile } from "@/lib/parse-file";
import { resolveMapping, rowsToEvents, type Mapping } from "@/lib/process-mining";

export const runtime = "nodejs";
export const maxDuration = 300;

const INSERT_BATCH_SIZE = 1000;

const ConfirmSchema = z.object({
  uploadId: z.string().uuid(),
  mapping: z.record(z.string(), z.string()),
});

export async function POST(request: Request) {
  try {
    const input = ConfirmSchema.parse(await request.json());
    const preview = await query<{
      id: string;
      name: string;
      filename: string;
      blob_url: string | null;
      headers: string[];
      rows: Record<string, unknown>[];
    }>("select * from upload_sessions where id = $1", [input.uploadId]);
    const row = preview.rows[0];
    if (!row) return NextResponse.json({ error: "Upload preview not found." }, { status: 404 });

    const sourceRows = row.blob_url ? await parseBlobRows(row.blob_url, row.filename) : row.rows;
    let mapping = input.mapping as Mapping;
    const headers = row.headers;
    for (const header of headers) {
      const key = header.toLowerCase().trim().replace(/\s+/g, "_");
      if (key.endsWith("_id") && !mapping[key]) mapping[key] = header;
    }

    mapping = resolveMapping(sourceRows, mapping);
    const events = rowsToEvents(sourceRows, mapping);
    if (!events.length) {
      return NextResponse.json({ error: "No valid process events were found with the selected mapping." }, { status: 400 });
    }

    // The application intentionally exposes a single current process dataset.
    // Reclaim the previous event-log storage before writing its replacement.
    await query('truncate table "Data_mining" restart identity');
    await query("delete from datasets");

    const dataset = await query<{ id: string }>(
      `insert into datasets (name, original_filename, blob_url, mapping)
       values ($1, $2, $3, $4::jsonb)
       returning id`,
      [row.name, row.filename, row.blob_url, JSON.stringify(mapping)],
    );
    const datasetId = dataset.rows[0].id;

    for (let start = 0; start < events.length; start += INSERT_BATCH_SIZE) {
      const batch = events.slice(start, start + INSERT_BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = batch.map((event, index) => {
        const offset = index * 10;
        values.push(
          datasetId,
          row.name,
          row.filename,
          start + index + 1,
          event.caseId,
          event.activity,
          event.timestamp,
          event.resource,
          event.cost,
          JSON.stringify(event.attrs),
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}::jsonb)`;
      });

      await query(
        `insert into "Data_mining"
           (dataset_id, dataset_name, original_filename, row_number, case_id, activity, event_ts, resource, cost, attrs)
         values ${placeholders.join(",")}`,
        values,
      );
    }

    await query("delete from upload_sessions where id = $1", [input.uploadId]);

    return NextResponse.json({ datasetId, eventCount: events.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload confirmation failed." },
      { status: 500 },
    );
  }
}

async function parseBlobRows(blobUrl: string, filename: string) {
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error("The original uploaded workbook could not be read.");
  const file = new File([await response.arrayBuffer()], filename, {
    type: response.headers.get("content-type") || "application/octet-stream",
  });
  return (await parseUploadedFile(file)).rows;
}
