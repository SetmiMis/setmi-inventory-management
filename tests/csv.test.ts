import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/lib/csv.ts";

const cols = [{ key: "a", label: "Name" }, { key: "b", label: "Qty" }];

test("header, rows, BOM and CRLF", () => {
  const out = toCsv([{ a: "Wire", b: 3 }], cols);
  assert.equal(out, "\uFEFFName,Qty\r\nWire,3\r\n");
});

test("commas, quotes and new lines are quoted", () => {
  const out = toCsv([{ a: 'He said "hi", ok', b: "x\ny" }], cols);
  assert.equal(out, '\uFEFFName,Qty\r\n"He said ""hi"", ok","x\ny"\r\n');
});

test("text that looks like a formula is neutralised, numbers are not", () => {
  const out = toCsv([{ a: "=SUM(A1)", b: -5 }, { a: "+1", b: 0 }, { a: "@x", b: null }], cols);
  assert.equal(out, "\uFEFFName,Qty\r\n'=SUM(A1),-5\r\n'+1,0\r\n'@x,\r\n");
});

test("hindi text survives", () => {
  assert.ok(toCsv([{ a: "तार", b: 1 }], cols).includes("तार"));
});
