import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  await requirePermission("items.import");

  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href="/items" className="text-blue-700 underline">Items</Link> / Import from Excel
      </p>
      <h1 className="text-xl font-semibold">Import items from Excel</h1>
      <div className="space-y-1 text-sm text-neutral-500">
        <p>
          Use the first sheet, with the headers in row 1: Internal_Item_Code, Item_Name, Item_Purchase_Source (LOCAL or IMPORT)
          are required. Optional: Selling_Item_Name, Import_item_code, Item_Category, Remarks, BARCODE (several barcodes
          separated by comma). Column order does not matter. Rows without an Item_Name are skipped.
        </p>
        <p>
          The file is checked first and nothing is saved until you press Import. Existing items are never changed:
          a code that already exists is shown as a problem. In Google Sheets: File &gt; Download &gt; Microsoft Excel (.xlsx).
        </p>
      </div>
      <ImportWizard />
    </main>
  );
}

export const metadata = { title: "Import Items" };
