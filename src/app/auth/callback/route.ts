import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The page the "reset your password" e-mail link opens. It swaps the one-time code for a session and
// sends the person to the fixed /reset-password page (never to an address taken from the link).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (code && code.length <= 200) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/reset-password", request.url));
  }
  return NextResponse.redirect(new URL("/forgot-password?expired=1", request.url));
}
