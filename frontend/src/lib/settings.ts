import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseStep, type MenuStep } from "@/lib/menu-steps";

// How much of the menu is shown (Settings > Modules). Before migration 60 the database function does not exist:
// the call then fails and the answer is 4 (everything), so the menu stays as it was.
export const getMenuStep = cache(async (): Promise<MenuStep> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("menu_step");
  return error ? 4 : parseStep(data);
});

// Is the billing module switched ON? Asked from the database, which also refuses to create bills
// while it is OFF; this helper only decides what the screens show. Cached for one request.
export const isBillingEnabled = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("billing_enabled");
  return data === true;
});
