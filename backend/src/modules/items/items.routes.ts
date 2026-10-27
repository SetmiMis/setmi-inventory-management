import { Router, type RequestHandler } from "express";
import { requireAnyPermission, requirePermission } from "../../middleware/auth.middleware.js";
import { bulkItems, createItem, getItem, listItems, suggestSku } from "./items.controller.js";

// /api/items. `auth` (sign-in check) is added by the caller. Each route names the right it needs.
export function itemsRouter(auth: RequestHandler): Router {
  const r = Router();
  r.use(auth);
  r.get("/", requirePermission("items.view"), listItems);
  r.get("/suggest-sku", requirePermission("items.create"), suggestSku);
  r.get("/:id", requirePermission("items.view"), getItem);
  r.post("/", requirePermission("items.create"), createItem);
  r.post("/bulk", requireAnyPermission("items.edit", "items.archive"), bulkItems);
  return r;
}
