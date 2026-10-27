import { test } from "node:test";
import assert from "node:assert/strict";
import { customerSchema } from "../src/lib/validation/customer.ts";

const ok = {
  name: "Raj Electronics", customerType: "DEALER", gstin: "", contactPerson: "", phone: "", email: "", address: "", city: "", state: "",
  creditLimit: "", paymentTerms: "", notes: "", isActive: true,
};

test("valid customer: blanks become null, text is trimmed", () => {
  const r = customerSchema.safeParse({ ...ok, name: "  Raj Electronics ", city: " Delhi ", creditLimit: "500000" });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.name, "Raj Electronics");
    assert.equal(r.data.city, "Delhi");
    assert.equal(r.data.creditLimit, 500000);
    assert.equal(r.data.gstin, null);
    assert.equal(r.data.email, null);
  }
});

test("name and type rules", () => {
  assert.equal(customerSchema.safeParse({ ...ok, name: "  " }).success, false);
  assert.equal(customerSchema.safeParse({ ...ok, name: "n".repeat(151) }).success, false);
  assert.equal(customerSchema.safeParse({ ...ok, customerType: "ALIEN" }).success, false);
  for (const t of ["DEALER", "DISTRIBUTOR", "RETAILER", "OEM", "PROJECT", "GOVERNMENT", "OTHER"]) {
    assert.equal(customerSchema.safeParse({ ...ok, customerType: t }).success, true);
  }
});

test("GSTIN is upper-cased and must be 15 letters or digits; credit limit is a non-negative number", () => {
  const good = customerSchema.safeParse({ ...ok, gstin: " 07abcde1234f1z5 " });
  assert.equal(good.success && good.data.gstin, "07ABCDE1234F1Z5");
  assert.equal(customerSchema.safeParse({ ...ok, gstin: "123" }).success, false);
  assert.equal(customerSchema.safeParse({ ...ok, creditLimit: "-1" }).success, false);
  assert.equal(customerSchema.safeParse({ ...ok, creditLimit: "abc" }).success, false);
  assert.equal(customerSchema.safeParse({ ...ok, notes: "n".repeat(1001) }).success, false);
});
