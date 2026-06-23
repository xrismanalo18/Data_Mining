import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { summarizeDealHealth } from "@/lib/deal-health";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Please upload an Excel or CSV contract file." },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    const preferredSheet = workbook.SheetNames.includes("Synthetic Contracts")
      ? "Synthetic Contracts"
      : workbook.SheetNames[0];
    if (!preferredSheet) throw new Error("The workbook has no worksheets.");

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[preferredSheet],
      { defval: "", raw: true },
    );
    if (!rows.length) throw new Error("No contract rows were found.");
    if (!("Contract_ID" in rows[0])) {
      throw new Error("The selected sheet must include a Contract_ID column.");
    }

    return NextResponse.json({
      filename: file.name,
      sheetName: preferredSheet,
      ...summarizeDealHealth(rows),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Deal-health scoring failed." },
      { status: 500 },
    );
  }
}
