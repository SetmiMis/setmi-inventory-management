"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client. Used ONLY to send a file to Storage with a one-time ticket from the server
// (uploadToSignedUrl). It uses the public publishable key; the ticket is what grants access.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase public settings");
  return createBrowserClient(url, key);
}
