import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "../item-form";
import { ArchiveControl, BarcodeManager } from "../item-extras";
import { BUCKET } from "@/lib/validation/files";
import { FileManager } from "./file-manager";

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("items.view");
  const idParse = z.uuid().safeParse((await params).id);
  if (!idParse.success) notFound();
  const warn = (await searchParams).warn;

  const supabase = await createClient();
  const [{ data: item }, { data: categories }, { data: units }] = await Promise.all([
    supabase
      .from("items")
      .select("*, item_barcodes(id, barcode, is_generated)")
      .eq("id", idParse.data)
      .maybeSingle(),
    supabase.from("categories").select("id, name, is_active").order("name"),
    supabase.from("units").select("code, name").order("code"),
  ]);
  if (!item) notFound();

  // Private bucket: show files through signed links that expire after one hour.
  const filePaths: string[] = [...(item.image_paths ?? []), ...(item.datasheet_path ? [item.datasheet_path] : [])];
  const urlByPath = new Map<string, string | null>();
  if (filePaths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(filePaths, 3600);
    for (const s of signed ?? []) if (s.path) urlByPath.set(s.path, s.signedUrl ?? null);
  }
  const images = (item.image_paths ?? []).map((p: string) => ({ path: p, url: urlByPath.get(p) ?? null }));
  const datasheet = item.datasheet_path
    ? { path: item.datasheet_path as string, url: urlByPath.get(item.datasheet_path) ?? null }
    : null;

  // Active categories, plus this item's current one even if it was switched off.
  const categoryOptions = (categories ?? [])
    .filter((c) => c.is_active || c.id === item.category_id)
    .map((c) => ({ id: c.id, name: c.name }));
  const canEdit = can(user, "items.edit");

  return (
    <main className="space-y-6">
      <p className="text-sm">
        <Link href="/items" className="text-blue-700 underline">Items</Link> / {item.internal_item_code}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{item.item_name}</h1>
        {!item.is_active && (
          <span className="rounded border border-amber-500 px-2 py-0.5 text-xs">Archived</span>
        )}
      </div>

      {warn === "barcodes" && (
        <p role="alert" className="rounded border border-amber-500 p-3 text-sm">
          The item was created, but its barcodes were not saved (a barcode may already belong to another item).
          Add them below.
        </p>
      )}

      {canEdit ? (
        <ItemForm
          categories={categoryOptions}
          units={units ?? []}
          canEditSellingName={can(user, "items.edit_selling_name")}
          item={{
            id: item.id,
            updatedAt: item.updated_at,
            internalItemCode: item.internal_item_code,
            importItemCode: item.import_item_code,
            itemName: item.item_name,
            sellingItemName: item.selling_item_name,
            categoryId: item.category_id,
            purchaseSource: item.purchase_source,
            unit: item.unit,
            remarks: item.remarks,
          }}
        />
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Internal Item Code</dt><dd>{item.internal_item_code}</dd></div>
          <div><dt className="font-medium">Import Item Code</dt><dd>{item.import_item_code ?? ""}</dd></div>
          <div><dt className="font-medium">Item Name</dt><dd>{item.item_name}</dd></div>
          <div><dt className="font-medium">Selling Item Name</dt><dd>{item.selling_item_name}</dd></div>
          <div><dt className="font-medium">Purchase Source</dt><dd>{item.purchase_source}</dd></div>
          <div><dt className="font-medium">Unit</dt><dd>{item.unit}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Remarks</dt><dd>{item.remarks ?? ""}</dd></div>
        </dl>
      )}

      <BarcodeManager itemId={item.id} barcodes={item.item_barcodes ?? []} canEdit={canEdit} />

      <FileManager itemId={item.id} images={images} datasheet={datasheet} canEdit={canEdit} />

      {can(user, "items.archive") && <ArchiveControl itemId={item.id} isActive={item.is_active} />}
    </main>
  );
}
