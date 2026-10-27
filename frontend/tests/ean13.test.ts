import { test } from "node:test";
import assert from "node:assert/strict";
import { blackRuns, ean13CheckDigit, ean13Modules, isValidEan13 } from "../src/lib/barcode/ean13.ts";

test("check digit matches real EAN-13 numbers", () => {
  assert.equal(ean13CheckDigit("400638133393"), 1); // 4006381333931
  assert.equal(ean13CheckDigit("590123412345"), 7); // 5901234123457
  assert.equal(ean13CheckDigit("200000000001"), 5); // 2000000000015 (first generated number in the DB test)
  assert.throws(() => ean13CheckDigit("12345"));
  assert.throws(() => ean13CheckDigit("12345678901A"));
});

test("isValidEan13", () => {
  assert.equal(isValidEan13("4006381333931"), true);
  assert.equal(isValidEan13("4006381333932"), false); // wrong check digit
  assert.equal(isValidEan13("400638133393"), false); // 12 digits
  assert.equal(isValidEan13("40063813339311"), false);
  assert.equal(isValidEan13("abcdefghijklm"), false);
  assert.equal(isValidEan13(""), false);
});

test("bar pattern has the right structure", () => {
  for (const code of ["4006381333931", "5901234123457", "2000000000015", "0000000000000"]) {
    const m = ean13Modules(code);
    assert.equal(m.length, 95);
    assert.equal(m.slice(0, 3), "101"); // start guard
    assert.equal(m.slice(45, 50), "01010"); // centre guard
    assert.equal(m.slice(92), "101"); // end guard
    assert.match(m, /^[01]+$/);
  }
});

test("refuses to draw an invalid number", () => {
  assert.throws(() => ean13Modules("4006381333932"));
  assert.throws(() => ean13Modules("123"));
});

test("black runs add up to the black modules", () => {
  const m = ean13Modules("4006381333931");
  const runs = blackRuns(m);
  assert.equal(runs.reduce((s, r) => s + r.width, 0), [...m].filter((c) => c === "1").length);
  assert.equal(runs[0].start, 0);
});
