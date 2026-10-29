import Link from "next/link";
import { ChevronsUpDown, Package, SquarePen } from "lucide-react";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { RowMenu } from "./item-controls";

export type Row = {
  id: string; code: string; name: string; selling_item_name: string; category: string | null; unit: string; source: string;
  active: boolean; price: number | null; cost?: number | null; image: string | null; qty: number; reorder: number;
  status: "in" | "low" | "out" | "inactive";
};

export const STATUS_LABEL: Record<Row["status"], string> = { in: "In Stock", low: "Low Stock", out: "Out of Stock", inactive: "Inactive" };
export const STATUS_TONE: Record<Row["status"], "green" | "amber" | "red" | "gray"> = { in: "green", low: "amber", out: "red", inactive: "gray" };
export const qtyText = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const money = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

// The product table. Buying cost is shown only when the person may see it AND the database sent it (migration 59).
export function ItemsTable({
  rows, thumbs, selId, sort, dir, sortHref, rowHref, canEdit, canCreate, showCost,
}: {
  rows: Row[]; thumbs: Map<string, string>; selId: string | null; sort: string; dir: string;
  sortHref: (col: string) => string; rowHref: (id: string) => string; canEdit: boolean; canCreate: boolean; showCost: boolean;
}) {
  const sortHead = (col: string, label: string, right?: boolean) => (
    <th key={col} className={right ? "text-right" : undefined} aria-sort={sort === col ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={sortHref(col)} className="inline-flex items-center gap-1 hover:underline">
        {label}<ChevronsUpDown size={12} aria-hidden className={sort === col ? "text-[var(--brand-text)]" : "opacity-50"} />{sort === col ? (dir === "asc" ? "↑" : "↓") : ""}
      </Link>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="dash-table w-full text-left text-sm">
        <thead>
          <tr>
            <th aria-label="Select"></th><th>Image</th>{sortHead("code", "SKU Code")}{sortHead("name", "Product Name")}{sortHead("category", "Category")}
            <th>Unit</th>{sortHead("qty", "Current Stock", true)}<th className="text-right">Reorder Level</th>
            {showCost && <th className="text-right">Cost Price</th>}{sortHead("price", "Selling Price", true)}{sortHead("status", "Status")}
            <th>Source</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.id === selId;
            const thumb = r.image ? thumbs.get(r.image) : undefined;
            return (
              <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                <td><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.code}`} /></td>
                <td>
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private signed link, size is fixed
                      <img src={thumb} alt="" width={44} height={44} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <Package size={20} aria-hidden className="text-muted" />
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap"><Link href={rowHref(r.id)} className="font-semibold">{r.code}</Link></td>
                <td className="min-w-40 max-w-56"><span className="line-clamp-2">{r.name}</span></td>
                <td>{r.category ?? ""}</td>
                <td>{r.unit}</td>
                <td className={`text-right font-mono font-semibold ${r.status === "out" ? "text-red-600" : ""}`}>{qtyText(r.qty)}</td>
                <td className="text-right font-mono">{qtyText(r.reorder)}</td>
                {showCost && <td className="text-right font-mono">{money(r.cost)}</td>}
                <td className="text-right font-mono">{money(r.price)}</td>
                <td title={r.status === "low" ? "Below its reorder level in at least one place" : undefined}><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                <td>{r.source}</td>
                <td>
                  <span className="flex items-center gap-1.5">
                    {canEdit && <Link href={`/items/${r.id}`} aria-label={`Edit ${r.code}`} title="Edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                    <RowMenu id={r.id} canEdit={canEdit} canCreate={canCreate} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// No rows: either the database has no products at all, or the search / filters match none.
export function ItemsEmpty({ hasProducts, q, filtersOn, canCreate }: { hasProducts: boolean; q: string; filtersOn: boolean; canCreate: boolean }) {
  if (!hasProducts && !filtersOn) {
    return (
      <EmptyState icon={Package} title="No products yet. Create your first SKU." text="Products are what you buy and sell. Add the first one, or bring many at once from Excel."
        actionHref={canCreate ? "/items/new" : undefined} actionLabel="+ Add Product" />
    );
  }
  return (
    <EmptyState icon={Package} title={q ? `No products matching '${q}'.` : "No products match these filters."}
      text="Try a different word or filter. You can also scan the barcode." actionHref="/items" actionLabel="Clear Filters" />
  );
}

const bar = "animate-pulse rounded-md bg-surface-muted";

export function KpiSkeleton() {
  return (
    <section aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`${bar} h-[5.5rem] rounded-2xl`} />)}
    </section>
  );
}

export function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading products" className="space-y-2">
      <div className={`${bar} h-11`} />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className={`${bar} h-14`} />)}
    </div>
  );
}
