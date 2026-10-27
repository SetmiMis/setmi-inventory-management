import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Company = { name: string; tagline: string; gst: string; pan: string; address: string; phone: string; email: string; website: string };

// The company information saved on the Settings page (the database function company_info()).
// Cached for one request. Used on the printed papers and on the Settings page.
export const getCompany = cache(async (): Promise<Company> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("company_info");
  const c = (data ?? {}) as Record<string, string | null>;
  const s = (k: string) => (typeof c[k] === "string" ? (c[k] as string) : "");
  return { name: s("name") || "SETMI INDIA", tagline: s("tagline"), gst: s("gst"), pan: s("pan"), address: s("address"), phone: s("phone"), email: s("email"), website: s("website") };
});

// One short line for a printed paper: address, phone, e-mail and GST number (only what was filled in).
export function companyLine(c: Company): string {
  return [c.address, c.phone, c.email, c.gst ? `GSTIN ${c.gst}` : ""].filter(Boolean).join(" · ");
}
