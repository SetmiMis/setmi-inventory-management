import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Is the billing module switched ON? Asked from the database, which also refuses to create bills
// while it is OFF; this helper only decides what the screens show. Cached for one request.
export const isBillingEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("billing_enabled");
  return data === true;
});
