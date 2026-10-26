import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { CountSheet, type SheetLine } from "../count-controls";

const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", IN_PROGRESS: "In Progress", WAITING_APPROVAL: "Waiting Approval", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const TYPE_LABEL: Record<string, string> = { FULL: "Full Count", CYCLE: "Cycle Count", LOCATION: "Location Count" };

type LineRow = { item_id: string; expected: number; counted: number | null; reason: string | null; items: { internal_item_code: string; item_name: string; unit: string } | null };

// The count sheet of one count: type what was really counted, item by item.
export default async function CountSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("stock.view", "stock.adjust", "stock.approve");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from("physical_counts").select("*, locations(name, code)").eq("id", id.data).maybeSingle();
  if (!c) notFound();
  const { data: lineData } = await supabase.from("physical_count_lines").select("item_id, expected, counted, reason, items(internal_item_code, item_name, unit)").eq("count_id", c.id);
  const lines: SheetLine[] = ((lineData ?? []) as unknown as LineRow[])
    .map((l) => ({ itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "", expected: Number(l.expected), counted: l.counted === null ? null : Number(l.counted), reason: l.reason ?? "" }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const editable = can(user, "stock.adjust") && mine.has(c.location_id) && (c.status === "PENDING" || c.status === "IN_PROGRESS");
  const place = c.locations as unknown as { name: string; code: string };

  return (
    <main className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted">
        <Link href="/stock/count">Physical Count</Link> <ChevronRight size={14} aria-hidden /> <span className="font-medium text-[var(--foreground)]">{c.count_no}</span>
      </nav>
      <div>
        <h1 className="!text-2xl !font-bold">{c.count_no} <span className="ml-2 align-middle text-sm font-medium text-muted">{STATUS_LABEL[c.status]}</span></h1>
        <p className="mt-1 text-sm text-muted">{TYPE_LABEL[c.count_type]} at {place.name} ({place.code}). The system quantity was frozen when this count was made.</p>
        {c.decision_note && c.status === "IN_PROGRESS" && <p role="status" className="mt-2 rounded-lg border border-amber-500 p-2 text-sm">The manager sent this count back: {c.decision_note}</p>}
        {!editable && <p className="mt-2 text-sm text-muted">{c.status === "WAITING_APPROVAL" ? "This count waits for a manager." : c.status === "COMPLETED" ? "This count is finished and the stock was corrected." : c.status === "CANCELLED" ? "This count was cancelled." : "You can look at this count here."}</p>}
      </div>
      <section className={`${cardClass} !p-4`}>
        <CountSheet id={c.id} lines={lines} editable={editable} />
      </section>
    </main>
  );
}
