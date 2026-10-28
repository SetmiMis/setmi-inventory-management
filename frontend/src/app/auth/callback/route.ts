import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const response = NextResponse.redirect(new URL("/reset-password", origin));
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 1. Agar PKCE code mila
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  // 2. Agar token_hash aur valid type mila
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) return response;
  }

  return NextResponse.redirect(new URL("/forgot-password?expired=1", origin));
}