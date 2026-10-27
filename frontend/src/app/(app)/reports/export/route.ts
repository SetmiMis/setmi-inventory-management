import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { REPORTS, parseParams, parseReportKey, runReport } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

// CSV download. Needs reports.export (and the database still needs reports.view and checks rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "reports.view") || !can(user, "reports.export")) {
    return new Response("Not allowed", { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const key = parseReportKey(sp.get("r") ?? undefined);
  const params = parseParams((n) => sp.get(n) ?? undefined);

  const supabase = await createClient();
  const { rows, error } = await runReport(supabase, key, params);
  if (error) return new Response("Could not build the report", { status: 500 });

  const def = REPORTS[key];
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, def.columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-${key}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
