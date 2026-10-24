import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number, label: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long (max ${max}).`).nullable());

// Server-side rules for a supplier. They mirror the database checks; the database is the final judge.
export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(150, "Name is too long (max 150)."),
  supplierType: z.enum(["LOCAL", "IMPORT"], "Choose LOCAL or IMPORT."),
  contactPerson: optionalText(100, "Contact person"),
  phone: optionalText(30, "Phone"),
  email: optionalText(150, "Email"),
  address: optionalText(500, "Address"),
  country: optionalText(60, "Country"),
  // Indian GSTIN is 15 letters/digits. Typed in lower case is accepted and upper-cased.
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 letters/digits.").nullable(),
  ),
  notes: optionalText(1000, "Notes"),
});

export function supplierFromForm(fd: FormData) {
  return supplierSchema.safeParse({
    name: fd.get("name"),
    supplierType: fd.get("supplierType"),
    contactPerson: fd.get("contactPerson"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    address: fd.get("address"),
    country: fd.get("country"),
    gstin: fd.get("gstin"),
    notes: fd.get("notes"),
  });
}
