import { test } from "node:test";
import assert from "node:assert/strict";
import { cellToText, normalizeHeader, parseItemSheet, splitBarcodes } from "../src/lib/import/items-sheet.ts";

// The header row and some rows exactly as they appear in the owner's real Google Sheet
// (note the stray space in "Import _item_code" and the placeholder rows that only say "SETMI-").
const HEADER = ["Sr No", "Selling_Item_Name", "Internal_Item_Code", "Import _item_code", "Item_Name", "Item_Category",
  "Item_Purchase_Source", "Item_img1", "Item_img2", "Item_img3", "Item_img4", "Item_Data_sheet", "Remarks", "BARCODE"];
const REAL = [
  HEADER,
  ["1", "", "SETMI-3RCA-3RCA CABLE 1.5 METER", "", "3RCA-3RCA CABLE 1.5 METER", "AUDIO-VIDEO CABLE", "IMPORT"],
  ["4", "", "SETMI-3.5 STEREO / STEREO CABLE 2 METER", "", "3.5 STEREO / STEREO CABLE 2 METER", "AUDIO-VIDEO CABLE", "IMPORT", "", "", "", "", "", "data base name change"],
  ["32", "", "SETMI-POWER CORD EXTENSION METAL BOARD 2.5 METER  4 SOCKET WITH 1 SWITCH-15-AMP", "",
    "POWER CORD EXTENSION METAL BOARD 2.5 METER  4 SOCKET WITH 1 SWITCH-15-AMP", "METAL EXTENSION BOARD", "LOCAL"],
  ["37", "", "SETMI-"],
  ["38", "", "SETMI-"],
];

test("headers match loosely", () => {
  assert.equal(normalizeHeader("Import _item_code"), "importitemcode");
  assert.equal(normalizeHeader(" IMPORT_ITEM_CODE "), "importitemcode");
  assert.equal(normalizeHeader(null), "");
});

test("the owner's real sheet layout parses; placeholder rows are skipped", () => {
  const r = parseItemSheet(REAL);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.rows.length, 3);
  assert.equal(r.skippedEmpty, 2); // the two "SETMI-" placeholders
  assert.equal(r.rows[0].row, 2); // Excel row number (header is row 1)
  assert.equal(r.rows[0].internal_item_code, "SETMI-3RCA-3RCA CABLE 1.5 METER");
  assert.equal(r.rows[0].purchase_source, "IMPORT");
  assert.equal(r.rows[0].selling_item_name, "");
  assert.equal(r.rows[1].remarks, "data base name change");
  assert.equal(r.rows[2].internal_item_code.length, 79); // long code is kept whole, double space included
  assert.match(r.rows[2].internal_item_code, /METER {2}4 SOCKET/);
  assert.deepEqual(r.ignoredColumns, []); // Sr No and image columns are known and ignored quietly
});

test("column order does not matter", () => {
  const r = parseItemSheet([
    ["Item_Purchase_Source", "Item_Name", "Internal_Item_Code", "BARCODE"],
    ["local", "Plug", "P-1", "8901234567890, 8901234567891"],
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.rows[0].internal_item_code, "P-1");
    assert.deepEqual(r.rows[0].barcodes, ["8901234567890", "8901234567891"]);
  }
});

test("missing required column gives a clear message", () => {
  const r = parseItemSheet([["Item_Name", "Remarks"], ["Plug", ""]]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /internalitemcode|itempurchasesource/);
});

test("unknown columns are reported, not imported", () => {
  const r = parseItemSheet([["Internal_Item_Code", "Item_Name", "Item_Purchase_Source", "Price"], ["A", "B", "LOCAL", "99"]]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.ignoredColumns, ["Price"]);
});

test("empty or header-only sheets", () => {
  assert.equal(parseItemSheet([]).ok, false);
  assert.equal(parseItemSheet([HEADER]).ok, false);
});

test("cells become safe plain text", () => {
  assert.equal(cellToText(8901234567890), "8901234567890"); // barcode typed as a number keeps every digit
  assert.equal(cellToText("  =HYPERLINK(...)  "), "=HYPERLINK(...)"); // formula-looking text stays text
  assert.equal(cellToText(null), "");
  assert.equal(cellToText(NaN), "");
  assert.equal(cellToText(1.5), "1.5");
});

test("splitBarcodes", () => {
  assert.deepEqual(splitBarcodes("1,2\n3;1"), ["1", "2", "3"]);
  assert.deepEqual(splitBarcodes(""), []);
});
