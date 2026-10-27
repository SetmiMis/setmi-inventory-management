import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";
import { loadEnv } from "../src/config/env.ts";
import { can, type CurrentUser } from "../src/middleware/auth.middleware.ts";
import { productBody, sanitizeSearch } from "../src/validation/item.ts";
import { friendlyDbError, statusForDbError } from "../src/utils/db-errors.ts";

const env = loadEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testtesttesttest", FRONTEND_URL: "http://localhost:3000" } as NodeJS.ProcessEnv);
let server: Server;
let base = "";

before(async () => {
  server = createApp(env).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); });

test("settings: missing or bad values stop the server with a clear message", () => {
  assert.throws(() => loadEnv({} as NodeJS.ProcessEnv), /SUPABASE_URL/);
  assert.throws(() => loadEnv({ SUPABASE_URL: "nope", SUPABASE_PUBLISHABLE_KEY: "x".repeat(30) } as NodeJS.ProcessEnv), /SUPABASE_URL/);
  assert.equal(loadEnv({ SUPABASE_URL: "https://a.supabase.co", SUPABASE_PUBLISHABLE_KEY: "x".repeat(30) } as NodeJS.ProcessEnv).PORT, 4000);
});

test("health answers and tells nothing about the system", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "ok" });
  assert.equal(r.headers.get("x-powered-by"), null);
});

test("every items route refuses a call without a sign-in token (401, JSON, no redirect)", async () => {
  for (const [method, path] of [["GET", "/api/items"], ["GET", "/api/items/suggest-sku"], ["POST", "/api/items"], ["POST", "/api/items/bulk"], ["GET", "/api/items/123"]] as const) {
    const r = await fetch(`${base}${path}`, { method, redirect: "manual", headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined });
    assert.equal(r.status, 401, `${method} ${path}`);
    assert.match(String((await r.json()).error), /Sign in/);
  }
});

test("a broken or too short token is refused before any database call", async () => {
  const r = await fetch(`${base}/api/items`, { headers: { Authorization: "Bearer abc" } });
  assert.equal(r.status, 401);
  const r2 = await fetch(`${base}/api/items`, { headers: { Authorization: "Basic abcdefabcdefabcdefabcdef" } });
  assert.equal(r2.status, 401);
});

test("unknown API address gives a JSON 404; bad JSON gives 400", async () => {
  const r = await fetch(`${base}/api/nothing`);
  assert.equal(r.status, 404);
  const r2 = await fetch(`${base}/api/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  assert.equal(r2.status, 400); // the body is read first, so a broken body is a plain 400 with a JSON message
  assert.match(String((await r2.json()).error), /JSON/);
});

test("security headers are set and other websites are not allowed by CORS", async () => {
  const r = await fetch(`${base}/health`, { headers: { Origin: "https://evil.example" } });
  // the answer always names the ONE allowed website, so the browser blocks every other website
  assert.notEqual(r.headers.get("access-control-allow-origin"), "https://evil.example");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  const ok = await fetch(`${base}/health`, { headers: { Origin: "http://localhost:3000" } });
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

const user = (over: Partial<CurrentUser> = {}): CurrentUser => ({ id: "u", email: "a@b.c", fullName: null, isActive: true, isAdmin: false, permissions: [], ...over });

test("permissions: admin can, listed right can, inactive never, others cannot", () => {
  assert.equal(can(user({ isAdmin: true }), "items.create"), true);
  assert.equal(can(user({ permissions: ["items.view"] }), "items.view"), true);
  assert.equal(can(user({ permissions: ["items.view"] }), "items.create"), false);
  assert.equal(can(user({ isAdmin: true, isActive: false }), "items.view"), false);
});

test("product rules: required fields, limits, units, tags", () => {
  const ok = productBody.safeParse({ internalItemCode: " SKU-1 ", itemName: "Cable", unit: "pcs", tags: ["a", "b"] });
  assert.equal(ok.success, true);
  if (ok.success) { assert.equal(ok.data.internalItemCode, "SKU-1"); assert.equal(ok.data.unit, "PCS"); assert.equal(ok.data.purchaseSource, "LOCAL"); }
  assert.equal(productBody.safeParse({ internalItemCode: "", itemName: "x" }).success, false);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", hsnCode: "AB12" }).success, false);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", sellingPrice: "-5" }).success, false);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", sellingPrice: 12.5 }).success, true);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", shortDescription: "x".repeat(501) }).success, false);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success, false);
  assert.equal(productBody.safeParse({ internalItemCode: "a", itemName: "x", purchaseSource: "MOON" }).success, false);
});

test("search text loses the characters that are special in a database filter", () => {
  assert.equal(sanitizeSearch("a,b(c)\"d\\e%f*g"), "a b c d e f g");
  assert.equal(sanitizeSearch(undefined), "");
  assert.equal(sanitizeSearch("x".repeat(200)).length, 64);
});

test("database errors become plain messages and the right status", () => {
  assert.equal(friendlyDbError({ code: "23505", message: "items_internal_code_uq" }), "This Internal Item Code already exists.");
  assert.equal(friendlyDbError({ code: "XX000", message: "relation \"secret_table\" broke" }), "Could not save. Please try again.");
  assert.equal(statusForDbError({ code: "42501" }), 403);
  assert.equal(statusForDbError({ code: "23505" }), 400);
});
