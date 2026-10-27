import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "../item-form";
import { ArchiveControl, BarcodeManager } from "../item-extras";
import { BUCKET } from "@/lib/validation/files";
import { FileManager } from "./file-manager";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";

const qtyText = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

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

  // Stock in every place and the last stock movements (the database shows only what this person may see).
  const [{ data: stockRows }, { data: places }, { data: moves }] = await Promise.all([
    supabase.from("stock_overview").select("location_id, quantity, min_qty, is_low").eq("item_id", item.id),
    supabase.from("locations").select("id, code, name"),
    supabase.from("stock_movements")
      .select("id, quantity, movement_type, created_at, from_loc:locations!stock_movements_from_location_id_fkey(code), to_loc:locations!stock_movements_to_location_id_fkey(code)")
      .eq("item_id", item.id).order("id", { ascending: false }).limit(8),
  ]);
  const placeName = new Map((places ?? []).map((l) => [l.id, `${l.name} (${l.code})`]));
  const totalQty = (stockRows ?? []).reduce((a, r) => a + Number(r.quantity), 0);

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
        <Link href="/items" className="text-blue-700 underline">Products / SKU</Link> / {item.internal_item_code}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{item.item_name}</h1>
        {!item.is_active && (
          <span className="rounded border border-amber-500 px-2 py-0.5 text-xs">Archived</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {can(user, "items.create") && <Link href={`/items/new?from=${item.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted">Duplicate</Link>}
        <Link href={`/items/${item.id}/labels`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted">Print barcode</Link>
        <Link href={`/items?q=${encodeURIComponent(item.internal_item_code)}`} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted">Back to list</Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Stock now: {qtyText(totalQty)} {item.unit}</h2>
          {(stockRows ?? []).length === 0 ? <p className="text-sm text-muted">No stock record yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(stockRows ?? []).map((r) => (
                <li key={r.location_id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{placeName.get(r.location_id) ?? "Place"}{r.min_qty !== null ? <span className="text-xs text-muted"> · reorder at {qtyText(Number(r.min_qty))}</span> : null}</span>
                  <span className={`shrink-0 font-mono font-semibold ${r.is_low ? "text-amber-600" : ""}`}>{qtyText(Number(r.quantity))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Last stock movements</h2>
          {(moves ?? []).length === 0 ? <p className="text-sm text-muted">No stock movement yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {((moves ?? []) as unknown as { id: number; quantity: number; movement_type: string; created_at: string; from_loc: { code: string } | null; to_loc: { code: string } | null }[]).map((m) => (
                <li key={m.id} className="py-1.5">
                  <span className="flex justify-between gap-2"><span className="font-medium">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</span><span className="font-mono">{qtyText(Number(m.quantity))} {item.unit}</span></span>
                  <span className="block text-xs text-muted">{m.from_loc?.code ?? "·"} → {m.to_loc?.code ?? "·"} · {when(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
          canEditPrice={can(user, "items.edit_price")}
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
            sellingPrice: item.selling_price === null ? null : String(item.selling_price),
            leadTimeDays: item.lead_time_days === null ? null : String(item.lead_time_days),
            safetyFactor: item.safety_factor === null ? null : String(Number(item.safety_factor)),
            moq: item.moq === null ? null : String(Number(item.moq)),
            subCategory: item.sub_category, brand: item.brand, hsnCode: item.hsn_code,
            shortDescription: item.short_description, detailedDescription: item.detailed_description,
            productType: item.product_type, material: item.material, color: item.color,
            netWeight: item.net_weight === null ? null : String(Number(item.net_weight)), weightUnit: item.weight_unit,
            dimL: item.dim_l === null ? null : String(Number(item.dim_l)), dimW: item.dim_w === null ? null : String(Number(item.dim_w)), dimH: item.dim_h === null ? null : String(Number(item.dim_h)), dimUnit: item.dim_unit,
            countryOfOrigin: item.country_of_origin, modelNo: item.model_no,
            searchKeywords: item.search_keywords, shelfLife: item.shelf_life,
            tags: item.tags ?? [], showInSales: item.show_in_sales, showInPurchase: item.show_in_purchase, lowStockAlert: item.low_stock_alert,
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
          <div><dt className="font-medium">Selling price</dt><dd>{item.selling_price ?? ""}</dd></div>
          <div><dt className="font-medium">Lead time (days)</dt><dd>{item.lead_time_days ?? ""}</dd></div>
          <div><dt className="font-medium">Safety factor / MOQ</dt><dd>{item.safety_factor ?? ""} / {item.moq ?? ""}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Remarks</dt><dd>{item.remarks ?? ""}</dd></div>
        </dl>
      )}

      <BarcodeManager itemId={item.id} barcodes={item.item_barcodes ?? []} canEdit={canEdit} />

      <FileManager itemId={item.id} images={images} datasheet={datasheet} canEdit={canEdit} />

      {can(user, "items.archive") && <ArchiveControl itemId={item.id} isActive={item.is_active} />}
    </main>
  );
}
