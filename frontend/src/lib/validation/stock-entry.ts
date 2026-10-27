import { z } from "zod";

// Reasons for the quick Stock In / Stock Out entry. The database accepts exactly these codes
// (check constraint on stock_entries and the create_stock_entry function).
export const OUT_REASONS = ["SOLD_OUTSIDE", "SAMPLE", "DAMAGED", "OWN_USE", "LOST", "RETURN_TO_SUPPLIER", "OTHER_OUT"] as const;
export const IN_REASONS = ["FOUND", "CUSTOMER_RETURN", "OTHER_IN"] as const;
export type EntryReason = (typeof OUT_REASONS)[number] | (typeof IN_REASONS)[number];

export const REASON_LABELS: Record<"en" | "hi", Record<EntryReason, string>> = {
  en: {
    SOLD_OUTSIDE: "Sold (billed in Zoho)", SAMPLE: "Sample", DAMAGED: "Damaged", OWN_USE: "Own use", LOST: "Lost",
    RETURN_TO_SUPPLIER: "Returned to supplier", OTHER_OUT: "Other", FOUND: "Found", CUSTOMER_RETURN: "Customer return", OTHER_IN: "Other",
  },
  hi: {
    SOLD_OUTSIDE: "बिका (Zoho में बिल)", SAMPLE: "सैंपल", DAMAGED: "ख़राब", OWN_USE: "अपने इस्तेमाल में", LOST: "गुम",
    RETURN_TO_SUPPLIER: "सप्लायर को वापस", OTHER_OUT: "अन्य", FOUND: "मिला", CUSTOMER_RETURN: "ग्राहक ने लौटाया", OTHER_IN: "अन्य",
  },
};

export const stockEntrySchema = z
  .object({
    direction: z.enum(["IN", "OUT"]),
    reason: z.enum([...OUT_REASONS, ...IN_REASONS]),
    reference: z.string().trim().max(60, "Reference is too long (max 60)."),
    remarks: z.string().trim().max(500, "Remarks are too long (max 500)."),
    lines: z
      .array(z.object({ itemId: z.uuid(), quantity: z.number().gt(0).max(99999999) }))
      .min(1, "Add at least one item.")
      .max(200, "At most 200 items in one entry."),
  })
  .refine((v) => (v.direction === "OUT" ? (OUT_REASONS as readonly string[]).includes(v.reason) : (IN_REASONS as readonly string[]).includes(v.reason)), {
    message: "Choose a reason that fits the direction.",
  })
  .refine((v) => !(v.reason === "OTHER_OUT" || v.reason === "OTHER_IN") || v.remarks.length > 0, {
    message: 'Write a remark for "Other".',
  });
