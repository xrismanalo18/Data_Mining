import { head } from "@vercel/blob";

const MAX_WORKBOOK_SIZE = 100 * 1024 * 1024;

export type WorkbookUpload = {
  file: File;
  name: string;
  blobUrl: string | null;
};

export async function readWorkbookUpload(request: Request, defaultName: string): Promise<WorkbookUpload> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Please upload a CSV or Excel file.");
    return { file, name: String(form.get("name") || defaultName), blobUrl: null };
  }

  const input = await request.json() as { blobUrl?: unknown; filename?: unknown; name?: unknown };
  if (typeof input.blobUrl !== "string" || typeof input.filename !== "string") {
    throw new Error("The uploaded workbook reference is invalid.");
  }

  const metadata = await head(input.blobUrl);
  if (metadata.url !== input.blobUrl || metadata.size > MAX_WORKBOOK_SIZE) {
    throw new Error("The uploaded workbook is invalid or exceeds the 100 MB limit.");
  }
  const response = await fetch(metadata.url);
  if (!response.ok) throw new Error("The uploaded workbook could not be read.");
  const file = new File([await response.arrayBuffer()], input.filename, { type: metadata.contentType });
  return { file, name: typeof input.name === "string" ? input.name : defaultName, blobUrl: metadata.url };
}
