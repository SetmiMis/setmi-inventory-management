// Rules for item images and datasheets. Pure functions only (no imports), so they can be
// tested with plain `node --test` and used on both browser (quick feedback) and server (real check).

export const BUCKET = "item-files";
export const MAX_IMAGES = 6;
export const LIMITS = { image: 5 * 1024 * 1024, datasheet: 10 * 1024 * 1024 } as const;

export type FileKind = "image" | "datasheet";
export type AllowedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const KIND_OF_TYPE: Record<AllowedType, FileKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "application/pdf": "datasheet",
};
const EXT_OF_TYPE: Record<AllowedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function kindOfType(contentType: string): FileKind | null {
  return (KIND_OF_TYPE as Record<string, FileKind>)[contentType] ?? null;
}

export function extensionFor(contentType: string): string | null {
  return (EXT_OF_TYPE as Record<string, string>)[contentType] ?? null;
}

export const ACCEPT_IMAGES = "image/jpeg,image/png,image/webp";
export const ACCEPT_DATASHEET = "application/pdf";

// WHY look at bytes: the browser-declared type and the file name are chosen by the uploader.
// The first bytes of a real JPEG / PNG / WebP / PDF cannot be faked by renaming a file.
export function detectFileType(bytes: Uint8Array): AllowedType | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^items/(${UUID})/(image|datasheet)-(${UUID})\\.(jpg|png|webp|pdf)$`);

// Storage paths are always built by the server from the item id and a random id, never from
// the uploader's file name. Anything that does not match this exact shape is refused.
export function buildStoragePath(itemId: string, contentType: string, randomId: string): string | null {
  const kind = kindOfType(contentType);
  const ext = extensionFor(contentType);
  if (!kind || !ext) return null;
  return `items/${itemId}/${kind}-${randomId}.${ext}`;
}

export function parseStoragePath(path: string): { itemId: string; kind: FileKind; ext: string } | null {
  const m = PATH_RE.exec(path);
  if (!m) return null;
  return { itemId: m[1], kind: m[2] as FileKind, ext: m[4] };
}

// Quick checks, used in the browser for fast feedback and again on the server.
export function checkDeclaredFile(contentType: string, size: number): { ok: true; kind: FileKind } | { ok: false; message: string } {
  const kind = kindOfType(contentType);
  if (!kind) return { ok: false, message: "Only JPG, PNG, WebP images and PDF datasheets are allowed." };
  if (!Number.isInteger(size) || size <= 0) return { ok: false, message: "The file is empty." };
  if (size > LIMITS[kind]) {
    return { ok: false, message: `${kind === "image" ? "Images" : "Datasheets"} can be at most ${LIMITS[kind] / 1024 / 1024} MB.` };
  }
  return { ok: true, kind };
}
