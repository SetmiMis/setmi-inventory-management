import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

type LineRow = { id: number; quantity_sent: number; quantity_received: number | null; items: { internal_item_code: string; item_name: string; unit: string } | null };

// A plain dispatch note for the paper file and the driver. It is NOT a tax invoice or e-way bill:
// whether one is needed between your places depends on your GST registrations (ask the accountant).
export default async function TransferPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission("transfers.view", "transfers.create", "transfers.send", "transfers.receive");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: t } = await supabase.from("stock_transfers").select("*").eq("id", id.data).maybeSingle();
  if (!t) notFound();
  const { data } = await supabase.from("stock_transfer_lines").select("id, quantity_sent, quantity_received, items(internal_item_code, item_name, unit)").eq("transfer_id", t.id).order("id");
  const lines = (data ?? []) as unknown as LineRow[];
  const received = t.status === "RECEIVED";

  return (
    <main className="space-y-4 bg-white p-4 text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/transfers/${t.id}`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <header className="border-b border-black pb-2">
        <p className="text-lg font-bold">SETMI INDIA</p>
        <p className="text-base font-semibold">Stock Transfer / Dispatch Note {t.transfer_no}{t.status === "DRAFT" ? " (DRAFT, not sent)" : t.status === "CANCELLED" ? " (CANCELLED)" : ""}</p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="font-semibold">From</dt><dd>{t.from_name} ({t.from_code})</dd></div>
        <div><dt className="font-semibold">To</dt><dd>{t.to_name} ({t.to_code})</dd></div>
        <div><dt className="font-semibold">Sent</dt><dd>{t.sent_at ? new Date(t.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"}</dd></div>
        <div><dt className="font-semibold">Notes</dt><dd>{t.notes ?? "-"}</dd></div>
      </dl>
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr className="border-y border-black"><th className="py-1 pr-2">#</th><th className="pr-2">Item code</th><th className="pr-2">Item</th><th className="pr-2 text-right">Sent</th>{received && <th className="text-right">Arrived</th>}</tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{l.items?.internal_item_code}</td><td className="pr-2">{l.items?.item_name}</td>
              <td className="pr-2 text-right">{Number(l.quantity_sent)} {l.items?.unit}</td>
              {received && <td className="text-right">{Number(l.quantity_received)} {l.items?.unit}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {t.receive_note && <p className="text-sm"><strong>Receiving note:</strong> {t.receive_note}</p>}
      <div className="grid grid-cols-3 gap-8 pt-16 text-sm"><p className="border-t border-black pt-1">Sent by</p><p className="border-t border-black pt-1">Carried by</p><p className="border-t border-black pt-1">Received by</p></div>
    </main>
  );
}
