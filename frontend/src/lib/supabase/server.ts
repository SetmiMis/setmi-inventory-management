import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server"; // 👈 Next.js request-time indicator
import { supabaseEnv } from "./env";
import { asSessionCookie, SESSION_ONLY_COOKIE } from "./session-cookie";

export async function createClient(options?: { sessionOnly?: boolean }) {
  // Prerender ke waqt Supabase Date.now() crash na kare, request aane ka wait karein
  await connection();

  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          const sessionOnly =
            options?.sessionOnly ??
            cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";

          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            cookieStore.set(
              name,
              value,
              sessionOnly && value ? asSessionCookie(cookieOptions) : cookieOptions
            );
          });
        } catch {
          // Server component render context me cookies write nahi ho sakti, ignore safely
        }
      },
    },
  });
}