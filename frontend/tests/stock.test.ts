import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuantity } from "../src/lib/validation/stock.ts";

test("parseQuantity accepts plain numbers", () => {
  assert.equal(parseQuantity("0"), 0);
  assert.equal(parseQuantity("12"), 12);
  assert.equal(parseQuantity(" 7 "), 7);
  assert.equal(parseQuantity("30.125"), 30.125);
  assert.equal(parseQuantity("2.5"), 2.5);
  assert.equal(parseQuantity("99999999"), 99999999);
});

test("parseQuantity refuses anything unclear", () => {
  for (const bad of ["", " ", "-1", "+3", "1,5", "1e5", "0x10", "1.2345", "1.", ".5", "abc", "12abc", "NaN", "Infinity", "100000000", "1 000", "٣"]) {
    assert.equal(parseQuantity(bad), null, `should refuse "${bad}"`);
  }
});
