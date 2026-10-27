import { z } from "zod";

const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);
const optionalText = (max: number, label: string) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long (max ${max}).`).nullable());

export const CUSTOMER_TYPES = ["DEALER", "DISTRIBUTOR", "RETAILER", "OEM", "PROJECT", "GOVERNMENT", "OTHER"] as const;
export const CUSTOMER_TYPE_LABEL: Record<(typeof CUSTOMER_TYPES)[number], string> = {
  DEALER: "Dealer", DISTRIBUTOR: "Distributor", RETAILER: "Retailer", OEM: "OEM", PROJECT: "Project", GOVERNMENT: "Government", OTHER: "Other",
};

// Server-side rules for a customer. They mirror the database checks; the database is the final judge.
export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(150, "Name is too long (max 150)."),
  customerType: z.enum(CUSTOMER_TYPES, "Choose a customer type."),
  // Indian GSTIN is 15 letters/digits. It is only stored; no tax is calculated anywhere.
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 letters/digits.").nullable(),
  ),
  contactPerson: optionalText(100, "Contact person"),
  phone: optionalText(30, "Phone"),
  email: optionalText(150, "Email"),
  address: optionalText(500, "Address"),
  city: optionalText(60, "City"),
  state: optionalText(60, "State"),
  // A note for the staff. Nothing checks it against a bill.
  creditLimit: z.preprocess(
    blankToNull,
    z.coerce.number("Credit limit must be a number.").min(0, "Credit limit cannot be negative.").max(99_999_999_999, "Credit limit is too big.").nullable(),
  ),
  paymentTerms: optionalText(60, "Payment terms"),
  notes: optionalText(1000, "Notes"),
  isActive: z.boolean(),
});

export function customerFromForm(fd: FormData, isEdit: boolean) {
  return customerSchema.safeParse({
    name: fd.get("name"),
    customerType: fd.get("customerType"),
    gstin: fd.get("gstin"),
    contactPerson: fd.get("contactPerson"),
    phone: fd.get("phone"),
    email: fd.get("email"),
    address: fd.get("address"),
    city: fd.get("city"),
    state: fd.get("state"),
    creditLimit: fd.get("creditLimit"),
    paymentTerms: fd.get("paymentTerms"),
    notes: fd.get("notes"),
    isActive: isEdit ? fd.get("isActive") === "on" : true,
  });
}
