// Builds a CSV that opens correctly in Excel: UTF-8 with a byte-order mark, CRLF line ends,
// quotes where needed. Text that starts with = + - @ would be run as a formula by Excel, so it
// gets a leading apostrophe (numbers are left alone).
export type CsvColumn = { key: string; label: string };

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(","));
  return "\uFEFF" + [head, ...body].join("\r\n") + "\r\n";
}
