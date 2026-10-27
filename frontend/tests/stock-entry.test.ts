import test from "node:test";
import assert from "node:assert/strict";
import { stockEntrySchema } from "../src/lib/validation/stock-entry.ts";

const line = { itemId: "11111111-1111-4111-8111-111111111111", quantity: 2 };

test("a stock out sold in Zoho passes", () => {
  assert.ok(stockEntrySchema.safeParse({ direction: "OUT", reason: "SOLD_OUTSIDE", reference: "ZOHO-1", remarks: "", lines: [line] }).success);
});

test("a reason that does not fit the direction is refused", () => {
  assert.equal(stockEntrySchema.safeParse({ direction: "IN", reason: "SAMPLE", reference: "", remarks: "", lines: [line] }).success, false);
  assert.equal(stockEntrySchema.safeParse({ direction: "OUT", reason: "FOUND", reference: "", remarks: "", lines: [line] }).success, false);
});

test('"Other" needs a remark', () => {
  assert.equal(stockEntrySchema.safeParse({ direction: "OUT", reason: "OTHER_OUT", reference: "", remarks: "", lines: [line] }).success, false);
  assert.ok(stockEntrySchema.safeParse({ direction: "OUT", reason: "OTHER_OUT", reference: "", remarks: "given to Rajesh", lines: [line] }).success);
});

test("no lines or a zero quantity is refused", () => {
  assert.equal(stockEntrySchema.safeParse({ direction: "IN", reason: "FOUND", reference: "", remarks: "", lines: [] }).success, false);
  assert.equal(stockEntrySchema.safeParse({ direction: "IN", reason: "FOUND", reference: "", remarks: "", lines: [{ ...line, quantity: 0 }] }).success, false);
});
