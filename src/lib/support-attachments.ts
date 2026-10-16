/**
 * Files in support conversations: PNG, JPEG or PDF, one per message, up to
 * 4 MB. The type is decided by the file's first bytes, never by its name or
 * the browser's claim, so a renamed executable is refused and what is stored
 * is exactly what is served back. Shared by the customer and admin replies.
 */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_ACCEPT = "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf";

export type SupportAttachmentType = "image/png" | "image/jpeg" | "application/pdf";

/** The real type of a file from its leading bytes, or null. */
export function sniffAttachmentType(bytes: Uint8Array): SupportAttachmentType | null {
  const starts = (sig: number[]) => sig.every((byte, i) => bytes[i] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

const EXTENSION: Record<SupportAttachmentType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
};

/** A safe display name: no path, no control or quote characters, the right extension, at most 120 characters. */
export function cleanAttachmentName(name: string, type: SupportAttachmentType): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "")
    .replace(/\.[^.]*$/, "")
    .trim()
    .slice(0, 100);
  return `${base || "attachment"}.${EXTENSION[type]}`;
}

export type ParsedAttachment =
  | { ok: true; attachment: { fileName: string; mimeType: SupportAttachmentType; sizeBytes: number; data: Uint8Array<ArrayBuffer> } | null }
  | { ok: false; error: string };

/**
 * Reads the optional "attachment" field of a submitted form. No file (or an
 * empty one, which is what a browser sends for an untouched file input) is
 * not an error: the message just has no attachment.
 */
export async function readAttachmentFromForm(formData: FormData): Promise<ParsedAttachment> {
  const value = formData.get("attachment");
  if (!value || typeof value === "string" || value.size === 0) return { ok: true, attachment: null };
  if (value.size > SUPPORT_ATTACHMENT_MAX_BYTES) return { ok: false, error: "That file is too large. Send a file up to 4 MB." };
  const data = new Uint8Array(await value.arrayBuffer());
  const mimeType = sniffAttachmentType(data);
  if (!mimeType) return { ok: false, error: "Only PNG, JPEG or PDF files can be sent." };
  return {
    ok: true,
    attachment: { fileName: cleanAttachmentName(value.name, mimeType), mimeType, sizeBytes: data.byteLength, data },
  };
}

/** "245 KB", "1.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
