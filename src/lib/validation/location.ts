import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

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
});

export function locationFromForm(fd: FormData) {
  return locationSchema.safeParse({
    code: fd.get("code"),
    name: fd.get("name"),
    type: fd.get("type"),
    address: fd.get("address"),
  });
}
