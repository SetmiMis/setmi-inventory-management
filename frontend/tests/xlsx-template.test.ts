import { test } from "node:test";
import assert from "node:assert/strict";
import { readSheet } from "read-excel-file/node";
import { buildTemplateXlsx, TEMPLATE_HEADERS } from "../src/lib/import/xlsx-template.ts";
import { parseItemSheet } from "../src/lib/import/items-sheet.ts";

// The downloadable template must be a real .xlsx that the product importer itself accepts.
test("the Excel template is read back by the importer", async () => {
  const bytes = buildTemplateXlsx();
  assert.equal(bytes[0], 0x50);
  const rows = (await readSheet(Buffer.from(bytes))) as unknown[][];
  assert.deepEqual(rows[0], TEMPLATE_HEADERS);
  const parsed = parseItemSheet(rows);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].internal_item_code, "CABL-0001");
  }
});
