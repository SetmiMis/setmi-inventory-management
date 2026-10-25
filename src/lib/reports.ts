import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CsvColumn } from "@/lib/csv";

// One place that says which reports exist, what they are called, their columns, and how to
// ask the database for them. The page and the CSV download both use it, so they never differ.
// The database functions check the reports.view permission and the row rules themselves.
export type ReportKey = "stock" | "low" | "sales-day" | "sales-item" | "dead";

export type ReportParams = { from: string; to: string; location: string | null; days: number };

type Def = {
  title: string;
  hint: string;
  needsDates: boolean;
  needsDays: boolean;
  columns: (CsvColumn & { numeric?: boolean })[];
  run: (db: SupabaseClient, p: ReportParams) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export const REPORTS: Record<ReportKey, Def> = {
  stock: {
    title: "Stock by place",
    hint: "Quantity of every item in each of your places, plus stock that is on its way to the place.",
    needsDates: false,
    needsDays: false,
    columns: [
      { key: "location_code", label: "Place" },
      { key: "internal_item_code", label: "Item code" },
      { key: "item_name", label: "Item" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "In stock", numeric: true },
      { key: "in_transit_to_here", label: "On the way here", numeric: true },
      { key: "min_qty", label: "Minimum", numeric: true },
    ],
    run: (db, p) => db.rpc("report_stock_by_place", { p_location: p.location }),
  },
  low: {
    title: "Low stock",
    hint: "Items at or below their minimum level, most short first.",
    needsDates: false,
    needsDays: false,
    columns: [
      { key: "location_code", label: "Place" },
      { key: "internal_item_code", label: "Item code" },
      { key: "item_name", label: "Item" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "In stock", numeric: true },
      { key: "min_qty", label: "Minimum", numeric: true },
      { key: "shortfall", label: "Short by", numeric: true },
    ],
    run: (db, p) => db.rpc("report_low_stock", { p_location: p.location }),
  },
  "sales-day": {
    title: "Sales per day",
    hint: "Bills per day and place, split by how they were paid. Voided bills are not counted. India time.",
    needsDates: true,
    needsDays: false,
    columns: [
      { key: "sale_date", label: "Date" },
      { key: "location_code", label: "Place" },
      { key: "bills", label: "Bills", numeric: true },
      { key: "subtotal", label: "Subtotal", numeric: true },
      { key: "discount", label: "Discount", numeric: true },
      { key: "total", label: "Total", numeric: true },
      { key: "cash", label: "Cash", numeric: true },
      { key: "upi", label: "UPI", numeric: true },
      { key: "card", label: "Card", numeric: true },
      { key: "other", label: "Other", numeric: true },
    ],
    run: (db, p) => db.rpc("report_sales_by_day", { p_from: p.from, p_to: p.to, p_location: p.location }),
  },
  "sales-item": {
    title: "What sold",
    hint: "Quantity and amount per item in the dates chosen, using the name and price saved on each bill.",
    needsDates: true,
    needsDays: false,
    columns: [
      { key: "item_code", label: "Item code" },
      { key: "item_name", label: "Name on bill" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "Quantity", numeric: true },
      { key: "amount", label: "Amount", numeric: true },
      { key: "bills", label: "Bills", numeric: true },
    ],
    run: (db, p) => db.rpc("report_sales_by_item", { p_from: p.from, p_to: p.to, p_location: p.location }),
  },
  dead: {
    title: "Slow stock",
    hint: "Items that are in stock but have not been sold from that place for the number of days chosen.",
    needsDates: false,
    needsDays: true,
    columns: [
      { key: "location_code", label: "Place" },
      { key: "internal_item_code", label: "Item code" },
      { key: "item_name", label: "Item" },
      { key: "unit", label: "Unit" },
      { key: "quantity", label: "In stock", numeric: true },
      { key: "last_sale", label: "Last sale" },
    ],
    run: (db, p) => db.rpc("report_dead_stock", { p_days: p.days, p_location: p.location }),
  },
};

export const REPORT_KEYS = Object.keys(REPORTS) as ReportKey[];

export function parseReportKey(v: string | undefined): ReportKey {
  return REPORT_KEYS.includes(v as ReportKey) ? (v as ReportKey) : "stock";
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dateOk = z.iso.date(); // a real calendar date, so 2026-13-45 is rejected here, not in the database

// Everything from the URL is untrusted: anything that does not parse falls back to a safe default.
export function parseParams(get: (name: string) => string | undefined): ReportParams {
  const to = dateOk.safeParse(get("to")).data ?? today();
  const from = dateOk.safeParse(get("from")).data ?? daysAgo(6);
  const days = Math.min(Math.max(parseInt(get("days") ?? "90", 10) || 90, 1), 3650);
  return { from, to, location: z.uuid().safeParse(get("location")).data ?? null, days };
}

export async function runReport(db: SupabaseClient, key: ReportKey, p: ReportParams) {
  const { data, error } = await REPORTS[key].run(db, p);
  return { rows: (data ?? []) as Record<string, unknown>[], error: error?.message ?? null };
}
