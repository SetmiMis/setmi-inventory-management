"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie";

export type LoginState = { error: string } | null;

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const FAIL: LoginState = { error: "Invalid email or password." };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return FAIL;

  const remember = formData.get("remember") === "on";
  const jar = await cookies();

  // Pehle session-only cookie set/delete karein taaki headers ready rahein
  if (remember) {
    jar.delete(SESSION_ONLY_COOKIE);
  } else {
    jar.set(SESSION_ONLY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  const supabase = await createClient({ sessionOnly: !remember });
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Agar login fail ho jaye toh cleanup
    jar.delete(SESSION_ONLY_COOKIE);
    return FAIL;
  }

  redirect("/dashboard");
}