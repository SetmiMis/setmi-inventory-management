import test from "node:test";
import assert from "node:assert/strict";
import { itemSchema } from "../src/lib/validation/item.ts";

const base = { internalItemCode: "A1", importItemCode: "", itemName: "Item", sellingItemName: "", categoryId: "", purchaseSource: "LOCAL", unit: "pcs", remarks: "", sellingPrice: "" };

test("planning fields are optional", () => {
  const r = itemSchema.safeParse({ ...base, leadTimeDays: "", safetyFactor: "", moq: "" });
  assert.ok(r.success);
  assert.equal(r.data.leadTimeDays, null);
  assert.equal(r.data.moq, null);
});

test("valid planning values pass", () => {
  const r = itemSchema.safeParse({ ...base, leadTimeDays: "90", safetyFactor: "1.5", moq: "100" });
  assert.ok(r.success);
  assert.equal(r.data.leadTimeDays, "90");
});

test("bad planning values are refused", () => {
  assert.equal(itemSchema.safeParse({ ...base, leadTimeDays: "2.5" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, leadTimeDays: "4000" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, safetyFactor: "0.5" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, safetyFactor: "11" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, moq: "0" }).success, false);
  assert.equal(itemSchema.safeParse({ ...base, moq: "-3" }).success, false);
});
