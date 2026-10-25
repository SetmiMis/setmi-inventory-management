import Link from "next/link";
import { Badge } from "@/components/badge";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { FileSpreadsheet, Plus, Search, Tags } from "lucide-react";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("items.view");
  const sp = await searchParams;

  // Everything from the URL is untrusted: parse it into safe values.
  const q = sanitizeSearch(first(sp.q));
  const status = ["active", "archived", "all"].includes(first(sp.status) ?? "") ? first(sp.status)! : "active";
  const source = ["LOCAL", "IMPORT"].includes(first(sp.source) ?? "") ? first(sp.source)! : "";
  const categoryId = z.uuid().safeParse(first(sp.category)).data ?? "";
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);

  const supabase = await createClient();

  // Scanner support: a USB scanner types the digits and presses Enter. If the text is exactly
  // one item's barcode, go straight to that item (the same lookup billing will use later).
  if (q) {
    const { data: exact } = await supabase.from("item_barcodes").select("item_id").eq("barcode", q).maybeSingle();
    if (exact) redirect(`/items/${exact.item_id}`);
  }

  // Barcode search: find items whose barcode matches, then include them in the filter.
  let barcodeItemIds: string[] = [];
  if (q) {
    const { data } = await supabase.from("item_barcodes").select("item_id").ilike("barcode", `%${q}%`).limit(200);
    barcodeItemIds = (data ?? []).map((r) => r.item_id);
  }

  let query = supabase
    .from("items")
    .select("id, internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, is_active, categories(name)", {
      count: "exact",
    });
  if (status !== "all") query = query.eq("is_active", status === "active");
  if (source) query = query.eq("purchase_source", source);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (q) {
    const like = `%${q}%`;
    const parts = [
      `internal_item_code.ilike.${like}`,
      `import_item_code.ilike.${like}`,
      `item_name.ilike.${like}`,
      `selling_item_name.ilike.${like}`,
    ];
    if (barcodeItemIds.length > 0) parts.push(`id.in.(${barcodeItemIds.join(",")})`);
    query = query.or(parts.join(","));
  }
  const from = (page - 1) * PAGE_SIZE;
  const [{ data: items, count, error }, { data: categories }] = await Promise.all([
    query.order("internal_item_code").range(from, from + PAGE_SIZE - 1),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "active") params.set("status", status);
    if (source) params.set("source", source);
    if (categoryId) params.set("category", categoryId);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/items?${s}` : "/items";
  };

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Items</h1>
        <div className="flex gap-2">
          {can(user, "categories.manage") && (
            <Link href="/items/categories" className={secondaryButton}><Tags size={16} aria-hidden /> Categories</Link>
          )}
          {can(user, "items.import") && (
            <Link href="/items/import" className={secondaryButton}><FileSpreadsheet size={16} aria-hidden /> Import Excel</Link>
          )}
          {can(user, "items.create") && (
            <Link href="/items/new" className={primaryButton}><Plus size={16} aria-hidden /> New item</Link>
          )}
        </div>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-line bg-surface p-3 shadow-sm sm:grid-cols-5">
        <input name="q" defaultValue={q} placeholder="Search code, name, or scan a barcode" aria-label="Search" autoFocus
          className={`${inputClass} !mt-0 sm:col-span-2`} />
        <select name="category" defaultValue={categoryId} aria-label="Category" className={`${inputClass} !mt-0`}>
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="source" defaultValue={source} aria-label="Purchase source" className={`${inputClass} !mt-0`}>
          <option value="">LOCAL + IMPORT</option>
          <option value="LOCAL">LOCAL</option>
          <option value="IMPORT">IMPORT</option>
        </select>
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0`}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button type="submit" className={`${primaryButton} sm:col-span-5 sm:w-32`}><Search size={16} aria-hidden /> Search</button>
      </form>

      {error ? (
        <p role="alert" className="text-red-600">Could not load items.</p>
      ) : (items ?? []).length === 0 ? (
        <p className="text-sm">No items found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">Code</th>
                <th className="pr-3">Item Name</th>
                <th className="pr-3">Selling Name (bill)</th>
                <th className="pr-3">Category</th>
                <th className="pr-3">Source</th>
                <th className="pr-3">Unit</th>
                <th className="pr-3 text-right">Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <tr key={it.id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">
                    <Link href={`/items/${it.id}`} className="font-medium text-blue-700 underline">
                      {it.internal_item_code}
                    </Link>
                  </td>
                  <td className="pr-3">{it.item_name}</td>
                  <td className="pr-3">{it.selling_item_name}</td>
                  {/* Many-to-one embed: PostgREST returns one object (or null), the untyped client guesses an array. */}
                  <td className="pr-3">{(it.categories as unknown as { name: string } | null)?.name ?? ""}</td>
                  <td className="pr-3">{it.purchase_source}</td>
                  <td className="pr-3">{it.unit}</td>
                  <td className="pr-3 text-right font-mono">{it.selling_price ?? ""}</td>
                  <td><Badge tone={it.is_active ? "green" : "gray"}>{it.is_active ? "Active" : "Archived"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} item{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
