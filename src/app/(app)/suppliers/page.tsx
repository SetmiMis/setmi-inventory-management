import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Truck } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = ["active", "archived", "all"].includes(first(sp.status) ?? "") ? first(sp.status)! : "active";
  const type = ["LOCAL", "IMPORT"].includes(first(sp.type) ?? "") ? first(sp.type)! : "";

  const supabase = await createClient();
  let query = supabase.from("suppliers").select("id, name, supplier_type, contact_person, phone, country, is_active").order("name");
  if (status !== "all") query = query.eq("is_active", status === "active");
  if (type) query = query.eq("supplier_type", type);
  const { data, error } = await query;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Suppliers</h1>
        {can(user, "suppliers.manage") && <Link href="/suppliers/new" className={primaryButton}>New supplier</Link>}
      </div>
      <form method="get" className="flex flex-wrap items-center gap-3">
        <select name="type" defaultValue={type} aria-label="Type" className={`${inputClass} !mt-0 w-44`}>
          <option value="">LOCAL + IMPORT</option><option value="LOCAL">LOCAL</option><option value="IMPORT">IMPORT</option>
        </select>
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0 w-36`}>
          <option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option>
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>
      {error ? (
        <p role="alert" className="text-red-600">You may not see suppliers, or they could not be loaded.</p>
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers yet" text="Suppliers are the people you buy goods from. Add them once; then they can be chosen on purchase orders and receipts." actionHref={can(user, "suppliers.manage") ? "/suppliers/new" : undefined} actionLabel="New supplier" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300">
              <th className="py-2 pr-3">Name</th><th className="pr-3">Type</th><th className="pr-3">Contact</th><th className="pr-3">Phone</th><th>Status</th>
            </tr></thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3"><Link href={`/suppliers/${s.id}`} className="font-medium text-blue-700 underline">{s.name}</Link></td>
                  <td className="pr-3">{s.supplier_type}{s.country ? ` (${s.country})` : ""}</td>
                  <td className="pr-3">{s.contact_person ?? ""}</td><td className="pr-3">{s.phone ?? ""}</td>
                  <td>{s.is_active ? "Active" : "Archived"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
