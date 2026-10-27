"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import {
  BUCKET,
  LIMITS,
  MAX_IMAGES,
  buildStoragePath,
  checkDeclaredFile,
  detectFileType,
  extensionFor,
  kindOfType,
  parseStoragePath,
} from "@/lib/validation/files";

// Upload flow (files go browser -> Supabase Storage directly, because Vercel limits request
// bodies to about 4.5 MB while datasheets may be 10 MB):
//   1. requestUpload  : permission + type/size check, returns a one-time upload ticket
//   2. browser uploads the file with the ticket
//   3. confirmUpload  : server re-reads the stored file, checks size and REAL content bytes,
//                       then attaches it to the item (or deletes it if anything is wrong)
// Known limit: a file uploaded in step 2 but never confirmed stays in the bucket (orphan).

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; message: string };
export type FileResult = { ok: boolean; message: string };
const fail = (message: string): FileResult => ({ ok: false, message });

const idSchema = z.uuid();

// Step 1
export async function requestUpload(input: {
  itemId: string;
  size: number;
  contentType: string;
}): Promise<UploadTicket> {
  await requirePermission("items.edit");
  const itemId = idSchema.safeParse(input.itemId);
  if (!itemId.success) return { ok: false, message: "Invalid item." };

  const declared = checkDeclaredFile(String(input.contentType), Number(input.size));
  if (!declared.ok) return declared;

  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("id, image_paths").eq("id", itemId.data).maybeSingle();
  if (!item) return { ok: false, message: "Item not found." };
  if (declared.kind === "image" && item.image_paths.length >= MAX_IMAGES) {
    return { ok: false, message: `An item can have at most ${MAX_IMAGES} images. Remove one first.` };
  }

  // The path never contains the uploader's file name.
  const path = buildStoragePath(itemId.data, input.contentType, crypto.randomUUID());
  if (!path) return { ok: false, message: "File type not allowed." };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Could not start the upload. Please try again." };
  return { ok: true, path, token: data.token };
}

// Reads the item, builds a change, writes it only if nobody changed the item meanwhile.
async function updateItemFiles(
  itemId: string,
  build: (item: { image_paths: string[]; datasheet_path: string | null }) => Record<string, unknown> | "noop" | { error: string },
): Promise<{ ok: true; before: { image_paths: string[]; datasheet_path: string | null } } | { ok: false; message: string }> {
  const supabase = await createClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: item } = await supabase
      .from("items")
      .select("id, image_paths, datasheet_path, updated_at")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return { ok: false, message: "Item not found." };

    const change = build(item);
    if (change === "noop") return { ok: true, before: item };
    if ("error" in change && typeof change.error === "string") return { ok: false, message: change.error };

    const { data, error } = await supabase
      .from("items")
      .update(change)
      .eq("id", itemId)
      .eq("updated_at", item.updated_at)
      .select("id");
    if (error) return { ok: false, message: friendlyDbError(error) };
    if (data && data.length > 0) return { ok: true, before: item };
  }
  return { ok: false, message: "The item was changed at the same time. Please try again." };
}

// Step 3
export async function confirmUpload(input: { itemId: string; path: string }): Promise<FileResult> {
  await requirePermission("items.edit");
  const itemId = idSchema.safeParse(input.itemId);
  const parsedPath = parseStoragePath(String(input.path));
  if (!itemId.success || !parsedPath || parsedPath.itemId !== itemId.data) return fail("Invalid upload.");
  const { kind, ext } = parsedPath;
  const path = String(input.path);

  const supabase = await createClient();
  const bucket = supabase.storage.from(BUCKET);
  const reject = async (message: string): Promise<FileResult> => {
    await bucket.remove([path]);
    return fail(message);
  };

  const { data: blob, error: downloadError } = await bucket.download(path);
  if (downloadError || !blob) return fail("The uploaded file was not found. Please try again.");

  if (blob.size > LIMITS[kind]) return reject("The file is too large.");
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const detected = detectFileType(head);
  if (!detected || kindOfType(detected) !== kind || extensionFor(detected) !== ext) {
    return reject("This file is not a real JPG, PNG, WebP or PDF. It was rejected.");
  }

  const result = await updateItemFiles(itemId.data, (item) => {
    if (kind === "datasheet") return { datasheet_path: path };
    if (item.image_paths.includes(path)) return "noop";
    if (item.image_paths.length >= MAX_IMAGES) return { error: `An item can have at most ${MAX_IMAGES} images.` };
    return { image_paths: [...item.image_paths, path] };
  });
  if (!result.ok) return reject(result.message);

  // A replaced datasheet is no longer referenced: remove the old file (best effort).
  if (kind === "datasheet" && result.before.datasheet_path && result.before.datasheet_path !== path) {
    await bucket.remove([result.before.datasheet_path]);
  }

  revalidatePath(`/items/${itemId.data}`);
  return { ok: true, message: kind === "image" ? "Image added." : "Datasheet saved." };
}

// Make one picture the Main picture (the first one, shown in lists). Only the order of the item's own pictures changes.
export async function setMainImage(input: { itemId: string; path: string }): Promise<FileResult> {
  await requirePermission("items.edit");
  const itemId = idSchema.safeParse(input.itemId);
  const parsedPath = parseStoragePath(String(input.path));
  if (!itemId.success || !parsedPath || parsedPath.itemId !== itemId.data || parsedPath.kind !== "image") return fail("Invalid file.");
  const path = String(input.path);
  const result = await updateItemFiles(itemId.data, (item) =>
    item.image_paths.includes(path) ? { image_paths: [path, ...item.image_paths.filter((p) => p !== path)] } : { error: "File not found on this item." });
  if (!result.ok) return fail(result.message);
  revalidatePath(`/items/${itemId.data}`);
  revalidatePath("/items");
  return { ok: true, message: "Main picture changed." };
}

// Remove an image or the datasheet. The path must belong to THIS item (never trust the browser).
export async function removeFile(input: { itemId: string; path: string }): Promise<FileResult> {
  await requirePermission("items.edit");
  const itemId = idSchema.safeParse(input.itemId);
  const parsedPath = parseStoragePath(String(input.path));
  if (!itemId.success || !parsedPath || parsedPath.itemId !== itemId.data) return fail("Invalid file.");
  const path = String(input.path);

  const result = await updateItemFiles(itemId.data, (item) => {
    if (parsedPath.kind === "datasheet") {
      return item.datasheet_path === path ? { datasheet_path: null } : { error: "File not found on this item." };
    }
    return item.image_paths.includes(path)
      ? { image_paths: item.image_paths.filter((p) => p !== path) }
      : { error: "File not found on this item." };
  });
  if (!result.ok) return fail(result.message);

  const supabase = await createClient();
  await supabase.storage.from(BUCKET).remove([path]);

  revalidatePath(`/items/${itemId.data}`);
  return { ok: true, message: "File removed." };
}
