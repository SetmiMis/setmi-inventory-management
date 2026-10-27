import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const COLUMNS = [
  { key: "code", label: "Location code" },
  { key: "place_name", label: "Warehouse / shop" },
  { key: "city", label: "City" },
  { key: "rack", label: "Rack" },
  { key: "level", label: "Level" },
  { key: "bin_no", label: "Bin" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "qty", label: "Current stock (units)" },
  { key: "capacity", label: "Capacity (units)" },
  { key: "utilization", label: "Utilization %" },
];

// CSV download of the rack list with the same filters as the screen (at most 5000 rows).
// The database returns only the places this person may see.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const rack = /^[A-Z0-9]{1,6}$/.test(sp.get("rack") ?? "") ? sp.get("rack") : null;
  const status = ["occupied", "available", "blocked"].includes(sp.get("status") ?? "") ? sp.get("status") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("bins_page", { p_q: q || null, p_location: place, p_rack: rack, p_status: status, p_limit: 100, p_offset: offset });
  const first = await call(0);
  if (first.error || !first.data) return new Response("Could not build the file", { status: 500 });
  const rows = [...((first.data as { rows: Record<string, unknown>[] }).rows ?? [])];
  const total = Number((first.data as { total: number }).total ?? 0);
  for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
    const next = await call(offset);
    if (next.error) return new Response("Could not build the file", { status: 500 });
    rows.push(...(((next.data as { rows: Record<string, unknown>[] }).rows) ?? []));
  }

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-racks-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
