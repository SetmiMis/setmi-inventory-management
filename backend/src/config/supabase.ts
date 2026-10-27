import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env.js";

// A database client that acts as ONE signed-in person: it sends that person's token, so Row Level Security and the
// permission checks inside the database functions apply. Created per request, never shared.
export function createUserClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
