// Turns the rows of an Excel sheet into import rows for the database function import_items.
// Pure functions (no imports) so they are unit tested against the owner's real sheet layout.
// The database function re-checks every value; this file only reads the sheet sensibly.

export const MAX_IMPORT_ROWS = 2000;

export type ImportRow = {
  row: number; // the row number as the person sees it in Excel (header = row 1)
  internal_item_code: string;
  import_item_code: string;
  item_name: string;
  selling_item_name: string;
  category: string;
  purchase_source: string;
  remarks: string;
  barcodes: string[];
};

export type ParseResult =
  | { ok: false; message: string }
  | { ok: true; rows: ImportRow[]; skippedEmpty: number; ignoredColumns: string[]; tooManyRows: boolean };

// "Import _item_code", "IMPORT_ITEM_CODE" and "import item code" must all mean the same column.
export function normalizeHeader(h: unknown): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELDS: Record<string, keyof Omit<ImportRow, "row" | "barcodes"> | "barcode"> = {
  internalitemcode: "internal_item_code",
  importitemcode: "import_item_code",
  itemname: "item_name",
  sellingitemname: "selling_item_name",
  itemcategory: "category",
  itempurchasesource: "purchase_source",
  remarks: "remarks",
  barcode: "barcode",
};
// Known columns that are deliberately not imported.
const IGNORED = new Set(["srno", "itemimg1", "itemimg2", "itemimg3", "itemimg4", "itemdatasheet"]);
export const REQUIRED_HEADERS = ["internalitemcode", "itemname", "itempurchasesource"];

// Any cell becomes plain text. Formulas are never run (the library gives stored values);
// a number such as a barcode keeps all its digits.
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function splitBarcodes(text: string): string[] {
  return [...new Set(text.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean))];
}

export function parseItemSheet(sheet: unknown[][]): ParseResult {
  if (!Array.isArray(sheet) || sheet.length === 0) return { ok: false, message: "The file has no rows." };

  const headers = sheet[0].map(normalizeHeader);
  const colOf = new Map<string, number>(); // field name -> column index
  const ignoredColumns: string[] = [];
  headers.forEach((h, i) => {
    if (!h) return;
    if (FIELDS[h] && !colOf.has(FIELDS[h])) colOf.set(FIELDS[h], i);
    else if (!IGNORED.has(h) && !FIELDS[h]) ignoredColumns.push(String(sheet[0][i]));
  });

  const missing = REQUIRED_HEADERS.filter((h) => !colOf.has(FIELDS[h]));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Column(s) not found in row 1: ${missing.join(", ")}. Expected headers like Internal_Item_Code, Item_Name, Item_Purchase_Source.`,
    };
  }

  const get = (cells: unknown[], field: string) => {
    const i = colOf.get(field);
    return i === undefined ? "" : cellToText(cells[i]);
  };

  const rows: ImportRow[] = [];
  let skippedEmpty = 0;
  for (let r = 1; r < sheet.length; r++) {
    const cells = sheet[r] ?? [];
    // The owner's sheet has many placeholder rows that only contain "SETMI-". A row with no
    // Item_Name is treated as empty and skipped, not as an error.
    if (get(cells, "item_name") === "") {
      skippedEmpty++;
      continue;
    }
    rows.push({
      row: r + 1,
      internal_item_code: get(cells, "internal_item_code"),
      import_item_code: get(cells, "import_item_code"),
      item_name: get(cells, "item_name"),
      selling_item_name: get(cells, "selling_item_name"),
      category: get(cells, "category"),
      purchase_source: get(cells, "purchase_source"),
      remarks: get(cells, "remarks"),
      barcodes: splitBarcodes(get(cells, "barcode")),
    });
  }

  if (rows.length === 0) return { ok: false, message: "No item rows found (every row has an empty Item_Name)." };
  const tooManyRows = rows.length > MAX_IMPORT_ROWS;
  return { ok: true, rows: tooManyRows ? rows.slice(0, MAX_IMPORT_ROWS) : rows, skippedEmpty, ignoredColumns, tooManyRows };
}
