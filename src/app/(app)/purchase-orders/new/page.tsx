import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { PoEditor } from "../po-editor";

export default async function NewPurchaseOrderPage() {
  const user = await requirePermission("purchase.create");
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/purchase-orders">Purchase orders</Link> / New</p>
      <h1>New purchase order</h1>
      <p className="text-sm text-muted">A draft does not change stock. Stock goes up only when goods are received and the receipt is posted.</p>
      {(suppliers ?? []).length === 0 ? (
        <p role="status" className="rounded border border-amber-500 p-3 text-sm">
          There is no supplier yet. {can(user, "suppliers.manage") ? <Link href="/suppliers/new">Create a supplier</Link> : "Ask an administrator to create one."}
        </p>
      ) : (
        <PoEditor
          initial={{ poId: null, poNo: null, supplierId: "", orderDate: today, expectedDate: "", notes: "", lines: [] }}
          suppliers={suppliers ?? []}
          placeName={`${loc.name} (${loc.code})`}
          canSend={can(user, "purchase.approve")}
          canCost={can(user, "receipts.cost")}
        />
      )}
    </main>
  );
}
