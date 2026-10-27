// Fixed lists for import shipments (used by the form, the screen and the server action).
export const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
export const STATUS_STEPS = [["BOOKED", "Booked"], ["DISPATCHED", "Dispatched"], ["IN_TRANSIT", "In Transit"], ["ARRIVED", "Arrived at Port"], ["CUSTOMS", "Customs Clearance"], ["DELIVERED", "Delivered"]] as const;
export const CHARGE_TYPES = [["FREIGHT", "Freight"], ["CUSTOMS_DUTY", "Customs duty"], ["CLEARING", "Clearing / CHA"], ["INSURANCE", "Insurance"], ["PORT", "Port charges"], ["OTHER", "Other"]] as const;
