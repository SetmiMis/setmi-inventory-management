// "Remember this device" support. Used by the server client and by proxy.ts (so no server-only import here).

// Name of the small cookie that says "this person did NOT tick Remember this device".
// While it is present the sign-in cookies are written as browser-session cookies (gone when the browser closes).
export const SESSION_ONLY_COOKIE = "ims_session_only";

// Removes the expiry from a cookie so the browser forgets it when it closes.
export function asSessionCookie<T extends { maxAge?: number; expires?: Date }>(options: T): T {
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
