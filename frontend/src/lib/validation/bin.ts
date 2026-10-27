import { z } from "zod";

const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

// A rack, level or bin part: up to 6 capital letters or digits. A single digit gets a leading zero (1 becomes 01),
// so codes sort in a sensible order: WH01-A-01-01.
const part = (label: string) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const t = v.trim().toUpperCase();
      return /^[0-9]$/.test(t) ? `0${t}` : t;
    },
    z.string().regex(/^[A-Z0-9]{1,6}$/, `${label} must be 1 to 6 letters or digits.`),
  );

// Server-side rules for a rack / shelf / bin. They mirror the database checks; the database is the final judge.
export const binSchema = z.object({
  locationId: z.uuid("Choose the warehouse or shop."),
  rack: part("Rack"),
  level: part("Level"),
  binNo: part("Bin"),
  binType: z.enum(["BIN", "SHELF", "PALLET"], "Choose Bin, Shelf or Pallet."),
  // Units the place can hold. Empty means "not set".
  capacity: z.preprocess(
    blankToNull,
    z.coerce.number("Capacity must be a number.").min(0, "Capacity cannot be negative.").max(1_000_000_000, "Capacity is too big.").nullable(),
  ),
  notes: z.preprocess(blankToNull, z.string().trim().max(500, "Notes are too long (max 500).").nullable()),
  blocked: z.boolean(),
  blockReason: z.preprocess(blankToNull, z.string().trim().max(200, "The reason is too long (max 200).").nullable()),
});

export function binFromForm(fd: FormData) {
  return binSchema.safeParse({
    locationId: fd.get("locationId"),
    rack: fd.get("rack"),
    level: fd.get("level"),
    binNo: fd.get("binNo"),
    binType: fd.get("binType"),
    capacity: fd.get("capacity"),
    notes: fd.get("notes"),
    blocked: fd.get("blocked") === "on",
    blockReason: fd.get("blockReason"),
  });
}
