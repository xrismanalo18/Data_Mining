import { upload } from "@vercel/blob/client";

const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

export async function postWorkbook(form: FormData, previewUrl: string) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose an Excel or CSV file.");

  if (file.size <= DIRECT_UPLOAD_THRESHOLD) {
    return fetch(previewUrl, { method: "POST", body: form });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const blob = await upload(`process-uploads/${Date.now()}-${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/uploads/blob",
    multipart: true,
  });

  return fetch(previewUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blobUrl: blob.url,
      filename: file.name,
      name: String(form.get("name") || "Uploaded Event Log"),
    }),
  });
}

export async function readApiResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(response.ok
      ? "The server returned an empty response. Please try the upload again."
      : `The server could not process the request (HTTP ${response.status}).`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const plainText = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    const detail = plainText && plainText.length <= 300
      ? plainText
      : "The server returned a non-JSON response.";
    throw new Error(`${detail}${response.ok ? "" : ` (HTTP ${response.status})`}`);
  }
}
