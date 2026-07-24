import * as XLSX from "xlsx";

import { detectMapping } from "@/lib/process-mining";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
  headerRow: number;
};

export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    raw: false,
  });
  if (!workbook.SheetNames.length) throw new Error("The workbook has no sheets.");

  const candidates = workbook.SheetNames
    .map(sheetName => parseSheet(sheetName, workbook.Sheets[sheetName]))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  if (!candidates.length) throw new Error("No tabular rows were found in the uploaded file.");

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  return {
    headers: best.headers,
    rows: best.rows,
    sheetName: best.sheetName,
    headerRow: best.headerRow,
  };
}

function parseSheet(sheetName: string, sheet: XLSX.WorkSheet | undefined) {
  if (!sheet) return null;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (matrix.length < 2) return null;

  const headerIndex = findHeaderRow(matrix);
  const rawHeaders = matrix[headerIndex] || [];
  const columns = rawHeaders
    .map((value, index) => ({ index, header: String(value ?? "").trim() }))
    .filter(column => column.header);
  if (columns.length < 2) return null;

  const seen = new Map<string, number>();
  const headers = columns.map(column => {
    const count = (seen.get(column.header) || 0) + 1;
    seen.set(column.header, count);
    return count === 1 ? column.header : `${column.header} (${count})`;
  });
  const rows = matrix
    .slice(headerIndex + 1)
    .filter(values => columns.some(column => String(values[column.index] ?? "").trim() !== ""))
    .map(values => Object.fromEntries(columns.map((column, index) => [headers[index], values[column.index] ?? ""])));
  if (!rows.length) return null;

  const mapping = detectMapping(headers, rows);
  const coreMatches = [mapping.case_id, mapping.activity, mapping.timestamp].filter(Boolean).length;
  const optionalMatches = [mapping.resource, mapping.cost].filter(Boolean).length;
  return {
    sheetName,
    headerRow: headerIndex + 1,
    headers,
    rows,
    score: coreMatches * 100_000 + optionalMatches * 10_000 + Math.min(rows.length, 9_999),
  };
}

function findHeaderRow(matrix: unknown[][]) {
  const semanticHeader = /(?:case|claim|order|invoice|ticket|activity|event|task|step|status|queue|date|time|resource|user|owner|agent|cost|amount|id|number)/i;
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < Math.min(matrix.length - 1, 30); index += 1) {
    const values = (matrix[index] || []).map(value => String(value ?? "").trim()).filter(Boolean);
    if (values.length < 2) continue;
    const uniqueCount = new Set(values.map(value => value.toLowerCase())).size;
    const textCount = values.filter(value => /[a-z]/i.test(value)).length;
    const semanticCount = values.filter(value => semanticHeader.test(value)).length;
    const following = matrix.slice(index + 1, index + 11);
    const populatedFollowingRows = following.filter(row => row.filter(value => String(value ?? "").trim()).length >= Math.min(2, values.length)).length;
    const score =
      values.length * 2 +
      uniqueCount * 2 +
      textCount * 3 +
      semanticCount * 12 +
      populatedFollowingRows * 4 -
      index * 0.25;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}
