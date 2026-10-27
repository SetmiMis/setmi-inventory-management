import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { secondaryButton } from "@/lib/ui";
import { TransferEditor, type Destination, type TLine } from "../transfer-editor";
import { ReceiveForm, type RLine } from "../receive-form";
import { RecallButton } from "../recall-button";

type LineRow = { id: number; item_id: string; quantity_sent: number; quantity_received: number | null; items: { internal_item_code: string; item_name: string; unit: string } | null };
const LABEL: Record<string, string> = { DRAFT: "Draft", SENT: "On the way", RECEIVED: "Received", CANCELLED: "Cancelled" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("transfers.view", "transfers.create", "transfers.send", "transfers.receive");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: t } = await supabase.from("stock_transfers").select("*").eq("id", id.data).maybeSingle();
  if (!t) notFound();
  const { data: lineData } = await supabase
    .from("stock_transfer_lines")
    .select("id, item_id, quantity_sent, quantity_received, items(internal_item_code, item_name, unit)")
    .eq("transfer_id", t.id).order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];

  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const atFrom = mine.has(t.from_location_id);
  const atTo = mine.has(t.to_location_id);
  const canEditDraft = t.status === "DRAFT" && atFrom && can(user, "transfers.create");
  const canReceive = t.status === "SENT" && atTo && can(user, "transfers.receive");
  const canRecall = t.status === "SENT" && atFrom && can(user, "transfers.send");

  let editorLines: TLine[] = [];
  let destinations: Destination[] = [];
  let receiveLines: RLine[] = [];
  if (canEditDraft || canReceive) {
    const { data: units } = await supabase.from("units").select("code, decimals");
    const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
    editorLines = lines.map((l) => ({ itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "PCS", decimals: dec.get(l.items?.unit ?? "PCS") ?? 0, quantity: String(Number(l.quantity_sent)) }));
    receiveLines = lines.map((l) => ({ itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "PCS", decimals: dec.get(l.items?.unit ?? "PCS") ?? 0, sent: Number(l.quantity_sent) }));
  }
  if (canEditDraft) {
    const { data } = await supabase.rpc("transfer_destinations");
    destinations = ((data ?? []) as Destination[]).filter((d) => d.id !== t.from_location_id);
  }
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");

  return (
    <main className="space-y-5">
      <p className="text-sm"><Link href="/transfers" className="text-blue-700 underline">Transfers</Link> / {t.transfer_no}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t.transfer_no}</h1>
        <span className="rounded border border-neutral-400 px-2 py-0.5 text-xs">{LABEL[t.status]}</span>
        {t.has_shortage && <span className="rounded border border-red-500 px-2 py-0.5 text-xs text-red-600">Shortage</span>}
      </div>
      <p className="text-sm">{t.from_name} ({t.from_code}) &rarr; {t.to_name} ({t.to_code})</p>

      {canEditDraft ? (
        <TransferEditor transferId={t.id} transferNo={t.transfer_no} fromName={`${t.from_name} (${t.from_code})`} destinations={destinations}
          initialTo={t.to_location_id} initialNotes={t.notes ?? ""} initialLines={editorLines} canSend={can(user, "transfers.send")} />
      ) : (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {t.sent_at && <div><dt className="font-medium">Sent</dt><dd>{when(t.sent_at)}</dd></div>}
            {t.received_at && <div><dt className="font-medium">Received</dt><dd>{when(t.received_at)}</dd></div>}
            {t.notes && <div className="sm:col-span-2"><dt className="font-medium">Notes</dt><dd>{t.notes}</dd></div>}
            {t.receive_note && <div className="sm:col-span-2"><dt className="font-medium">Receiving note</dt><dd>{t.receive_note}</dd></div>}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Sent</th>{t.status === "RECEIVED" && <th className="pr-3 text-right">Arrived</th>}</tr></thead>
              <tbody>
                {lines.map((l) => {
                  const short = l.quantity_received !== null && Number(l.quantity_received) < Number(l.quantity_sent);
                  return (
                    <tr key={l.id} className="border-b border-neutral-200">
                      <td className="py-2 pr-3">{l.items?.internal_item_code}<span className="block text-xs text-neutral-500">{l.items?.item_name}</span></td>
                      <td className="pr-3 text-right font-mono">{Number(l.quantity_sent)} {l.items?.unit}</td>
                      {t.status === "RECEIVED" && <td className={`pr-3 text-right font-mono ${short ? "font-medium text-red-600" : ""}`}>{Number(l.quantity_received)} {l.items?.unit}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {t.status === "SENT" && !canReceive && !canRecall && <p className="text-sm text-neutral-500">The goods are on the way. The receiving place will receive them.</p>}
          {t.status === "CANCELLED" && <p className="text-sm text-neutral-500">This transfer was cancelled.</p>}
          {canRecall && <RecallButton transferId={t.id} />}
          {canReceive && <ReceiveForm transferId={t.id} lines={receiveLines} />}
          <Link href={`/transfers/${t.id}/print`} className={secondaryButton + " inline-block"}>Print dispatch note</Link>
        </>
      )}
    </main>
  );
}
