export const HR_DOCUMENT_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type HrDocumentMimeType = (typeof HR_DOCUMENT_MIME_TYPES)[number];
export const HR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Detects the real file type from its first bytes; the name and declared type are ignored. */
export function detectDocumentMime(bytes: Uint8Array): HrDocumentMimeType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if (bytes.length >= PNG.length && PNG.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}
