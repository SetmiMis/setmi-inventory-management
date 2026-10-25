"use client";

import { useActionState, useState } from "react";
import { createItem, updateItem, type FormState } from "./actions";
import { inputClass, labelClass, primaryButton } from "@/lib/ui";

export type CategoryOption = { id: string; name: string };
export type ItemValues = {
  id: string;
  updatedAt: string;
  internalItemCode: string;
  importItemCode: string | null;
  itemName: string;
  sellingItemName: string;
  categoryId: string | null;
  purchaseSource: "LOCAL" | "IMPORT";
  unit: string;
  remarks: string | null;
  sellingPrice: string | null;
  leadTimeDays: string | null;
  safetyFactor: string | null;
  moq: string | null;
};

export type UnitOption = { code: string; name: string };

export function ItemForm({
  item,
  categories,
  units,
  canEditSellingName,
  canEditPrice,
}: {
  item?: ItemValues;
  categories: CategoryOption[];
  units: UnitOption[];
  canEditSellingName: boolean;
  canEditPrice: boolean;
}) {
  const editing = Boolean(item);
  const [state, formAction, pending] = useActionState<FormState, FormData>(editing ? updateItem : createItem, null);

  // On create, Selling Item Name follows Item Name until the user types in it themselves.
  const [itemName, setItemName] = useState(item?.itemName ?? "");
  const [sellingName, setSellingName] = useState(item?.sellingItemName ?? "");
  const [sellingTouched, setSellingTouched] = useState(editing);

  return (
    <form action={formAction} className="space-y-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      {item && <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="internalItemCode" className={labelClass}>Internal Item Code *</label>
          <input id="internalItemCode" name="internalItemCode" required maxLength={120}
            defaultValue={item?.internalItemCode} className={inputClass} />
        </div>
        <div>
          <label htmlFor="importItemCode" className={labelClass}>Import Item Code</label>
          <input id="importItemCode" name="importItemCode" maxLength={64}
            defaultValue={item?.importItemCode ?? ""} className={inputClass} />
        </div>
        <div>
          <label htmlFor="itemName" className={labelClass}>Item Name *</label>
          <input id="itemName" name="itemName" required maxLength={200} value={itemName}
            onChange={(e) => {
              setItemName(e.target.value);
              if (!sellingTouched) setSellingName(e.target.value);
            }}
            className={inputClass} />
          <p className="mt-1 text-xs text-neutral-500">Internal / stock-side name.</p>
        </div>
        <div>
          <label htmlFor="sellingItemName" className={labelClass}>Selling Item Name * (printed on bills)</label>
          <input id="sellingItemName" name="sellingItemName" maxLength={200} value={sellingName}
            disabled={editing && !canEditSellingName}
            onChange={(e) => {
              setSellingName(e.target.value);
              setSellingTouched(true);
            }}
            className={inputClass} />
          {editing && !canEditSellingName && (
            <p className="mt-1 text-xs text-neutral-500">You do not have permission to change this name.</p>
          )}
        </div>
        <div>
          <label htmlFor="categoryId" className={labelClass}>Category</label>
          <select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ""} className={inputClass}>
            <option value="">(none)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="purchaseSource" className={labelClass}>Purchase Source *</label>
          <select id="purchaseSource" name="purchaseSource" required defaultValue={item?.purchaseSource ?? "LOCAL"} className={inputClass}>
            <option value="LOCAL">LOCAL (Indian supplier)</option>
            <option value="IMPORT">IMPORT (foreign supplier)</option>
          </select>
        </div>
        <div>
          <label htmlFor="unit" className={labelClass}>Unit *</label>
          <select id="unit" name="unit" required defaultValue={item?.unit ?? "PCS"} className={inputClass}>
            {units.map((u) => (
              <option key={u.code} value={u.code}>{u.code} - {u.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">How stock is counted. Metres allow decimals, pieces do not. Cannot be changed once the item has stock.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sellingPrice" className={labelClass}>Selling price (rupees per unit, as charged)</label>
          <input id="sellingPrice" name="sellingPrice" inputMode="decimal" maxLength={11} defaultValue={item?.sellingPrice ?? ""}
            disabled={!canEditPrice} className={inputClass} />
          <p className="mt-1 text-xs text-neutral-500">
            {canEditPrice ? "Used when billing is switched on. Leave empty if the item is not billed here. No tax is calculated." : "You do not have permission to change the price."}
          </p>
        </div>
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-sm font-medium">Reorder planning (optional)</legend>
        <p className="mb-3 text-xs text-muted">
          Used by the Reorder screen: maximum level = average daily use x lead time x safety factor. Leave empty if you set a maximum by hand.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="leadTimeDays" className={labelClass}>Lead time (days from order to arrival)</label>
            <input id="leadTimeDays" name="leadTimeDays" inputMode="numeric" maxLength={4} defaultValue={item?.leadTimeDays ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="safetyFactor" className={labelClass}>Safety factor (empty = 1.5)</label>
            <input id="safetyFactor" name="safetyFactor" inputMode="decimal" maxLength={5} defaultValue={item?.safetyFactor ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor="moq" className={labelClass}>MOQ (minimum order quantity)</label>
            <input id="moq" name="moq" inputMode="decimal" maxLength={12} defaultValue={item?.moq ?? ""} className={inputClass} />
          </div>
        </div>
      </fieldset>

      {!editing && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="generateBarcode" defaultChecked /> Generate a SETMI barcode for this item (EAN-13, you can print it)
          </label>
          <label htmlFor="barcodes" className={labelClass}>Manufacturer barcodes you already have (one per line, optional)</label>
          <textarea id="barcodes" name="barcodes" rows={2} className={inputClass} />
        </div>
      )}

      <div>
        <label htmlFor="remarks" className={labelClass}>Remarks</label>
        <textarea id="remarks" name="remarks" rows={3} maxLength={2000} defaultValue={item?.remarks ?? ""} className={inputClass} />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving..." : editing ? "Save changes" : "Create item"}
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
