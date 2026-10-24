import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { TransferEditor, type Destination } from "../transfer-editor";

export default async function NewTransferPage() {
  const user = await requirePermission("transfers.create");
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const supabase = await createClient();
  const { data } = await supabase.rpc("transfer_destinations");
  const destinations = ((data ?? []) as Destination[]).filter((d) => d.id !== loc.id);

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/transfers" className="text-blue-700 underline">Transfers</Link> / New</p>
      <h1 className="text-xl font-semibold">New transfer</h1>
      <p className="text-sm text-neutral-500">A draft does not change stock. Stock leaves {loc.name} when the transfer is sent, and arrives only when the other place receives it.</p>
      <TransferEditor transferId={null} transferNo={null} fromName={`${loc.name} (${loc.code})`} destinations={destinations}
        initialTo="" initialNotes="" initialLines={[]} canSend={can(user, "transfers.send")} />
    </main>
  );
}
