import { z } from "zod";

const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const optionalText = (max: number, label: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long (max ${max}).`).nullable());

// Server-side rules for a warehouse or shop. They mirror the database checks
// (code 1-20 chars, name 1-100, address up to 500); the database stays the final judge.
export const locationSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required.")
    .max(20, "Code can be at most 20 characters.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _\-./]*$/, "Code may use letters, numbers, space and - _ . / only."),
  name: z.string().trim().min(1, "Name is required.").max(100, "Name is too long (max 100)."),
  type: z.enum(["WAREHOUSE", "SHOP"], "Choose Warehouse or Shop."),
  address: z.preprocess(blankToNull, z.string().trim().max(500, "Address is too long (max 500).").nullable()),
  city: optionalText(60, "City"),
  // Product slots (bins) the place has. Empty means "not set".
  capacity: z.preprocess(
    blankToNull,
    z.coerce.number("Capacity must be a number.").int("Capacity must be a whole number.").min(0, "Capacity cannot be negative.").max(10_000_000, "Capacity is too big.").nullable(),
  ),
  contactPerson: optionalText(100, "Contact person"),
  phone: optionalText(30, "Phone"),
  email: optionalText(150, "Email"),
});

export function locationFromForm(fd: FormData) {
  return locationSchema.safeParse({
    code: fd.get("code"),
    name: fd.get("name"),
    type: fd.get("type"),
    address: fd.get("address"),
    city: fd.get("city"),
    capacity: fd.get("capacity"),
    contactPerson: fd.get("contactPerson"),
    phone: fd.get("phone"),
    email: fd.get("email"),
  });
}
