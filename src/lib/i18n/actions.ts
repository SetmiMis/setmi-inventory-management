"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { LANG_COOKIE } from "./index";

// Remembers the screen language for a year. Only "en" and "hi" are accepted; anything else is ignored.
export async function setLanguage(fd: FormData) {
  const v = fd.get("lang");
  if (v !== "en" && v !== "hi") return;
  (await cookies()).set(LANG_COOKIE, v, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
