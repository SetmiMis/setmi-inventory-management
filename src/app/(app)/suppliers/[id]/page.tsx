import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierArchiveControl, SupplierForm } from "../supplier-form";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: s } = await supabase.from("suppliers").select("*").eq("id", id.data).maybeSingle();
  if (!s) notFound();
  const canManage = can(user, "suppliers.manage");

  return (
    <main className="space-y-6">
      <p className="text-sm"><Link href="/suppliers" className="text-blue-700 underline">Suppliers</Link> / {s.name}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{s.name}</h1>
        <span className="rounded border border-neutral-400 px-2 py-0.5 text-xs">{s.supplier_type}</span>
        {!s.is_active && <span className="rounded border border-amber-500 px-2 py-0.5 text-xs">Archived</span>}
      </div>
      {canManage ? (
        <SupplierForm
          supplier={{
            id: s.id, updatedAt: s.updated_at, name: s.name, supplierType: s.supplier_type, contactPerson: s.contact_person,
            phone: s.phone, email: s.email, address: s.address, country: s.country, gstin: s.gstin, notes: s.notes,
          }}
        />
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Contact person</dt><dd>{s.contact_person ?? ""}</dd></div>
          <div><dt className="font-medium">Phone</dt><dd>{s.phone ?? ""}</dd></div>
          <div><dt className="font-medium">Email</dt><dd>{s.email ?? ""}</dd></div>
          <div><dt className="font-medium">GSTIN</dt><dd>{s.gstin ?? ""}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Address</dt><dd>{s.address ?? ""}</dd></div>
        </dl>
      )}
      {canManage && <SupplierArchiveControl id={s.id} isActive={s.is_active} />}
    </main>
  );
}
