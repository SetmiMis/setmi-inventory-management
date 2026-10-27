import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { asSessionCookie, SESSION_ONLY_COOKIE } from "@/lib/supabase/session-cookie";

// Runs before every page request. Two jobs:
// 1. Refresh the Supabase session cookie so it does not expire mid-use.
// 2. Send visitors with no valid session to /login (a convenience redirect only).
// WHY this is NOT the security boundary: real checks happen in pages and server actions
// (src/lib/auth.ts) and in database RLS. Never rely on this file alone.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        const sessionOnly = request.cookies.get(SESSION_ONLY_COOKIE)?.value === "1";
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, sessionOnly && value ? asSessionCookie(options) : options);
        }
      },
    },
  });

  // getClaims verifies the token signature, so a forged cookie is not accepted.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const path = request.nextUrl.pathname;
  const onLogin = path === "/login";
  // Pages a signed-out person must be able to open: sign in, ask for a reset link, and the link target.
  const isPublic = onLogin || path === "/forgot-password" || path === "/reset-password" || path === "/auth/callback";

  if (!signedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && onLogin) {
    // The cookie can look fine (the signature checks out and it has not expired) while Supabase has already ended that
    // session (signed out elsewhere, removed by an admin). Ask the Auth server once. If the session is dead, clear the
    // stale cookie and show the login form, otherwise the pages send the person to /login and this file sends them
    // back to "/" again, for ever (an endless "Loading...").
    const { data: live } = await supabase.auth.getUser();
    if (!live.user) {
      await supabase.auth.signOut({ scope: "local" });
      return response;
    }
    const redirect = NextResponse.redirect(new URL("/", request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
