import { requirePermission } from "@/lib/auth";
import { buildTemplateXlsx } from "@/lib/import/xlsx-template";

// The empty Excel template for the product import (headers the importer understands plus one example row).
export async function GET() {
  await requirePermission("items.import");
  const body = buildTemplateXlsx();
  return new Response(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="products-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
