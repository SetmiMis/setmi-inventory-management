// Reads the two PUBLIC Supabase settings. The publishable key is designed to be public;
// data safety comes from Row Level Security in the database, not from hiding this key.
// The service-role key must never be read here or anywhere in client-reachable code.
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see docs/ENVIRONMENT.md)",
    );
  }
  return { url, key };
}
