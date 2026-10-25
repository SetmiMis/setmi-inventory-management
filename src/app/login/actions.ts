"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie";

export type LoginState = { error: string } | null;

const schema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

// Same message for every failure on purpose: it must not reveal whether an email exists.
const FAIL: LoginState = { error: "Invalid email or password." };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return FAIL;

  // A ticked box keeps the person signed in on this device; unticked means
  // the sign-in ends when the browser is closed.
  const remember = formData.get("remember") === "on";
  const supabase = await createClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return FAIL;

  const jar = await cookies();
  if (remember) jar.delete(SESSION_ONLY_COOKIE);
  else jar.set(SESSION_ONLY_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });

  redirect("/");
}
