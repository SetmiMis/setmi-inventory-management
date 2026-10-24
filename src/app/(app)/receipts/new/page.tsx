import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { ReceiptEditor } from "../receipt-editor";

export default async function NewReceiptPage() {
  const user = await requirePermission("receipts.create");
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/receipts" className="text-blue-700 underline">Receipts</Link> / New</p>
      <h1 className="text-xl font-semibold">New goods receipt</h1>
      <p className="text-sm text-neutral-500">A draft does not change stock. Stock goes up only when the receipt is posted.</p>
      {(suppliers ?? []).length === 0 ? (
        <p role="status" className="rounded border border-amber-500 p-3 text-sm">
          There is no supplier yet. {can(user, "suppliers.manage") ? <Link href="/suppliers/new" className="text-blue-700 underline">Create a supplier</Link> : "Ask an administrator to create one."}
        </p>
      ) : (
        <ReceiptEditor
          initial={{ receiptId: null, receiptNo: null, supplierId: "", receiptDate: today, invoiceNo: "", notes: "", lines: [] }}
          suppliers={suppliers ?? []}
          placeName={`${loc.name} (${loc.code})`}
          canPost={can(user, "receipts.post")}
          canCost={can(user, "receipts.cost")}
        />
      )}
    </main>
  );
}
