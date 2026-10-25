import { test } from "node:test";
import assert from "node:assert/strict";
import { locationSchema } from "../src/lib/validation/location.ts";

const ok = { code: "WH-MAIN", name: "Main warehouse", type: "WAREHOUSE", address: "" };

test("valid location, blank address becomes null, text is trimmed", () => {
  const r = locationSchema.safeParse({ ...ok, code: "  SHOP-01 ", type: "SHOP" });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.code, "SHOP-01");
    assert.equal(r.data.address, null);
  }
});

test("code rules", () => {
  assert.equal(locationSchema.safeParse({ ...ok, code: "" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, code: "x".repeat(21) }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, code: "x".repeat(20) }).success, true);
  assert.equal(locationSchema.safeParse({ ...ok, code: "WH 1/A.2_b" }).success, true);
  assert.equal(locationSchema.safeParse({ ...ok, code: "-start" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, code: "a;drop" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, code: "<b>" }).success, false);
});

test("type and name rules", () => {
  assert.equal(locationSchema.safeParse({ ...ok, type: "OFFICE" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, type: null }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, name: "   " }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, name: "n".repeat(101) }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, address: "a".repeat(501) }).success, false);
});

test("city, capacity and contact details are optional; capacity is a whole number from 0", () => {
  const r = locationSchema.safeParse({ ...ok, city: " Delhi ", capacity: "30", contactPerson: "", phone: "+91 98765 43210", email: "" });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.city, "Delhi");
    assert.equal(r.data.capacity, 30);
    assert.equal(r.data.contactPerson, null);
    assert.equal(r.data.email, null);
  }
  // the old form (no new fields) still works and capacity stays empty
  const old = locationSchema.safeParse(ok);
  assert.equal(old.success && old.data.capacity, null);
  assert.equal(locationSchema.safeParse({ ...ok, capacity: "-1" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, capacity: "2.5" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, capacity: "abc" }).success, false);
  assert.equal(locationSchema.safeParse({ ...ok, capacity: "0" }).success && true, true);
});
