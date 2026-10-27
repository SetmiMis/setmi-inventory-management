import { test } from "node:test";
import assert from "node:assert/strict";
import { asSessionCookie, SESSION_ONLY_COOKIE } from "../src/lib/supabase/session-cookie.ts";

test("a session cookie has no expiry, other options stay", () => {
  const out = asSessionCookie({ maxAge: 3600, expires: new Date(), path: "/", httpOnly: true, sameSite: "lax" as const });
  assert.equal(out.maxAge, undefined);
  assert.equal(out.expires, undefined);
  assert.equal(out.path, "/");
  assert.equal(out.httpOnly, true);
  assert.equal(out.sameSite, "lax");
});

test("the original options object is not changed", () => {
  const original = { maxAge: 60, path: "/" };
  asSessionCookie(original);
  assert.equal(original.maxAge, 60);
});

test("the flag cookie has a fixed name", () => {
  assert.equal(SESSION_ONLY_COOKIE, "ims_session_only");
});
