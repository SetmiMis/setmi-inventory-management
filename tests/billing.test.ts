import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTotal, parseMoney } from "../src/lib/validation/billing.ts";

test("parseMoney accepts rupees with up to 2 decimals", () => {
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney("100"), 100);
  assert.equal(parseMoney(" 40.5 "), 40.5);
  assert.equal(parseMoney("99999999.99"), 99999999.99);
});

test("parseMoney refuses anything unclear", () => {
  for (const bad of ["", "-1", "+5", "1,000", "1e3", "1.234", ".5", "5.", "abc", "NaN", "100000000", "1 0"]) {
    assert.equal(parseMoney(bad), null, `should refuse "${bad}"`);
  }
});

test("lineTotal matches the database rounding (the example from the DB test)", () => {
  assert.equal(lineTotal(2, 100), 200);
  assert.equal(lineTotal(1.5, 40.5), 60.75);
  assert.equal(lineTotal(2, 100) + lineTotal(1.5, 40.5) - 10, 250.75);
  assert.equal(lineTotal(3, 0.1), 0.3);
  assert.equal(lineTotal(1, 0.005), 0.01);
});
