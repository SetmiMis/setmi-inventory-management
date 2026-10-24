"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return FAIL;

  redirect("/");
}
