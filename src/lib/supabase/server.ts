import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";
import { asSessionCookie, SESSION_ONLY_COOKIE } from "./session-cookie";

// Server-side Supabase client bound to the signed-in user's cookies.
// Requests run as that user, so database Row Level Security applies to every query.
// `sessionOnly` is passed by the login action (the cookie is not readable yet in that same request).
export async function createClient(opts?: { sessionOnly?: boolean }) {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  const sessionOnly = opts?.sessionOnly ?? cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) {
            cookieStore.set(name, value, sessionOnly && value ? asSessionCookie(options) : options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session cookie on every request.
        }
      },
    },
  });
}
