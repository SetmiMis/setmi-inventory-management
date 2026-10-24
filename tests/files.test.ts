import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStoragePath,
  checkDeclaredFile,
  detectFileType,
  parseStoragePath,
} from "../src/lib/validation/files.ts";
import { parseBarcodes, sanitizeSearch, itemSchema } from "../src/lib/validation/item.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const RID = "22222222-2222-4222-8222-222222222222";

test("detectFileType recognises real signatures", () => {
  assert.equal(detectFileType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(detectFileType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(
    detectFileType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
    "image/webp",
  );
  assert.equal(detectFileType(new TextEncoder().encode("%PDF-1.7 ...")), "application/pdf");
});

test("detectFileType rejects disguised files", () => {
  assert.equal(detectFileType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(detectFileType(new TextEncoder().encode("MZ executable")), null);
  assert.equal(detectFileType(new TextEncoder().encode("<html><script>")), null);
  assert.equal(detectFileType(new Uint8Array(0)), null);
  // RIFF but not WebP (e.g. a WAV file renamed .webp)
  assert.equal(detectFileType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])), null);
});

test("checkDeclaredFile enforces type and size", () => {
  assert.equal(checkDeclaredFile("image/png", 1000).ok, true);
  assert.equal(checkDeclaredFile("image/svg+xml", 1000).ok, false);
  assert.equal(checkDeclaredFile("text/html", 1000).ok, false);
  assert.equal(checkDeclaredFile("image/jpeg", 5 * 1024 * 1024 + 1).ok, false);
  assert.equal(checkDeclaredFile("image/jpeg", 5 * 1024 * 1024).ok, true);
  assert.equal(checkDeclaredFile("application/pdf", 10 * 1024 * 1024).ok, true);
  assert.equal(checkDeclaredFile("application/pdf", 10 * 1024 * 1024 + 1).ok, false);
  assert.equal(checkDeclaredFile("image/png", 0).ok, false);
});

test("storage paths are built by the server and parsed strictly", () => {
  const p = buildStoragePath(ID, "image/png", RID)!;
  assert.equal(p, `items/${ID}/image-${RID}.png`);
  assert.deepEqual(parseStoragePath(p), { itemId: ID, kind: "image", ext: "png" });
  assert.equal(buildStoragePath(ID, "text/html", RID), null);
  // path tricks must not parse
  assert.equal(parseStoragePath(`items/${ID}/../other/image-${RID}.png`), null);
  assert.equal(parseStoragePath(`items/${ID}/image-${RID}.png/extra`), null);
  assert.equal(parseStoragePath(`other/${ID}/image-${RID}.png`), null);
  assert.equal(parseStoragePath(`items/${ID}/image-${RID}.exe`), null);
  assert.equal(parseStoragePath(`items/${ID}/shell-${RID}.pdf`), null);
});

test("parseBarcodes trims, de-duplicates and limits", () => {
  assert.deepEqual(parseBarcodes(" 111 \n222\r\n\n111").barcodes, ["111", "222"]);
  assert.ok(parseBarcodes(Array.from({ length: 21 }, (_, i) => `b${i}`).join("\n")).error);
  assert.ok(parseBarcodes("x".repeat(65)).error);
  assert.deepEqual(parseBarcodes("").barcodes, []);
});

test("sanitizeSearch removes filter-breaking characters", () => {
  assert.equal(sanitizeSearch('a,b(c)"d\\e%f*g'), "a b c d e f g");
  assert.equal(sanitizeSearch(undefined), "");
  assert.equal(sanitizeSearch("x".repeat(200)).length, 64);
});

test("itemSchema rules", () => {
  const base = {
    internalItemCode: " ABC-1 ",
    importItemCode: "",
    itemName: "Cable",
    sellingItemName: "",
    categoryId: "",
    purchaseSource: "LOCAL",
    unit: "PCS",
    remarks: "",
  };
  const ok = itemSchema.safeParse(base);
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.internalItemCode, "ABC-1");
    assert.equal(ok.data.importItemCode, null);
    assert.equal(ok.data.categoryId, null);
    assert.equal(ok.data.remarks, null);
  }
  assert.equal(itemSchema.safeParse({ ...base, internalItemCode: "  " }).success, false);
  // Real code from the owner's sheet (row 32), 85 characters with double spaces and a dot.
  const real = "SETMI-POWER CORD EXTENSION METAL BOARD 2.5 METER  4 SOCKET WITH 1 SWITCH-15-AMP";
  assert.equal(itemSchema.safeParse({ ...base, internalItemCode: real }).success, true);
  assert.equal(itemSchema.safeParse({ ...base, internalItemCode: "x".repeat(121) }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, itemName: "" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, purchaseSource: "OTHER" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, categoryId: "not-a-uuid" }).success, false);
});
