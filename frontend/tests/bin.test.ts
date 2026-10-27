import { test } from "node:test";
import assert from "node:assert/strict";
import { binSchema } from "../src/lib/validation/bin.ts";

const ok = {
  locationId: "11111111-1111-4111-8111-111111111111", rack: "a", level: "1", binNo: "01", binType: "BIN",
  capacity: "", notes: "", blocked: false, blockReason: "",
};

test("rack is upper-cased, a single digit gets a leading zero, blanks become null", () => {
  const r = binSchema.safeParse(ok);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.rack, "A");
    assert.equal(r.data.level, "01");
    assert.equal(r.data.binNo, "01");
    assert.equal(r.data.capacity, null);
    assert.equal(r.data.notes, null);
  }
});

test("rack, level and bin: 1 to 6 letters or digits only", () => {
  assert.equal(binSchema.safeParse({ ...ok, rack: "" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, rack: "A B" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, level: "A-1" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, binNo: "ABCDEFG" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, binNo: "ABCDEF" }).success, true);
});

test("type, capacity and place rules", () => {
  assert.equal(binSchema.safeParse({ ...ok, binType: "CRATE" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, binType: "PALLET", capacity: "2000" }).success, true);
  assert.equal(binSchema.safeParse({ ...ok, capacity: "-1" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, capacity: "abc" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, locationId: "nope" }).success, false);
  assert.equal(binSchema.safeParse({ ...ok, notes: "n".repeat(501) }).success, false);
});
