"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { ok?: boolean; error?: string } | null;

// Where the e-mail link should come back to. Supabase only accepts addresses on its Redirect URLs
// list (set in the Supabase dashboard), so a faked Host header cannot send the link anywhere else.
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Step 1: ask for a reset e-mail. The answer is the same whether or not the address exists,
// so this form cannot be used to find out who has an account.
export async function requestPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = z.email().max(254).safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await siteOrigin()}/auth/callback` });
  return { ok: true };
}

const passwordSchema = z.object({
  password: z.string().min(8).max(72),
  confirm: z.string(),
});

// Step 2: choose the new password. Only works with the session the e-mail link created.
export async function setNewPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: "short" };
  if (parsed.data.password !== parsed.data.confirm) return { error: "mismatch" };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "expired" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "rejected" };

  redirect("/");
}
