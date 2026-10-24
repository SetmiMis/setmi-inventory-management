import { test } from "node:test";
import assert from "node:assert/strict";
import { supplierSchema } from "../src/lib/validation/supplier.ts";

const ok = { name: "Sharma Traders", supplierType: "LOCAL", contactPerson: "", phone: "", email: "", address: "", country: "", gstin: "", notes: "" };

test("valid supplier, blanks become null", () => {
  const r = supplierSchema.safeParse(ok);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.gstin, null);
    assert.equal(r.data.phone, null);
  }
});

test("GSTIN is upper-cased and must be 15 letters/digits", () => {
  const good = supplierSchema.safeParse({ ...ok, gstin: " 22aaaaa0000a1z5 " });
  assert.equal(good.success, true);
  if (good.success) assert.equal(good.data.gstin, "22AAAAA0000A1Z5");
  assert.equal(supplierSchema.safeParse({ ...ok, gstin: "123" }).success, false);
  assert.equal(supplierSchema.safeParse({ ...ok, gstin: "22AAAAA0000A1Z5X" }).success, false);
  assert.equal(supplierSchema.safeParse({ ...ok, gstin: "22AAAAA0000A1Z-" }).success, false);
});

test("name and type rules", () => {
  assert.equal(supplierSchema.safeParse({ ...ok, name: "  " }).success, false);
  assert.equal(supplierSchema.safeParse({ ...ok, name: "n".repeat(151) }).success, false);
  assert.equal(supplierSchema.safeParse({ ...ok, supplierType: "OTHER" }).success, false);
  assert.equal(supplierSchema.safeParse({ ...ok, supplierType: "IMPORT", country: "China" }).success, true);
});
