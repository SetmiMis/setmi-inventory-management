import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { SupplierForm } from "../supplier-form";

export default async function NewSupplierPage() {
  await requirePermission("suppliers.manage");
  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/suppliers" className="text-blue-700 underline">Suppliers</Link> / New</p>
      <h1 className="text-xl font-semibold">New supplier</h1>
      <SupplierForm />
    </main>
  );
}
