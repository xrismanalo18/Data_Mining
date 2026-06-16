import * as XLSX from "xlsx";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, unknown>[];
};

export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) throw new Error("No rows were found in the uploaded file.");

  const headers = Object.keys(rows[0] || {}).map(header => String(header).trim());
  if (!headers.length) throw new Error("The uploaded file must include a header row.");

  return { headers, rows };
}
