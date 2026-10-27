"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ImagePlus, Loader2, Save, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_IMAGES, BUCKET, MAX_IMAGES, checkDeclaredFile } from "@/lib/validation/files";
import { confirmUpload, requestUpload } from "../[id]/file-actions";
import { createProduct } from "../actions";

type Option = { id: string; name: string };
type UnitOption = { code: string; name: string };

const field = "min-h-10 w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-base shadow-sm placeholder:text-muted disabled:opacity-60 sm:text-sm";
const area = "w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 py-2 text-base shadow-sm placeholder:text-muted sm:text-sm";
const card = "rounded-xl border border-line bg-surface p-4 shadow-sm";
const lab = "mb-1 block text-xs font-medium text-muted";

function Check({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm" title={hint}>
      <input type="checkbox" name={name} defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
      <span>{label}</span>
    </label>
  );
}

// Add Product: the few things almost every product needs are always visible; everything else is under "More details".
export function AddProductForm({ categories, units, brands, canEditPrice, canUploadImages }: {
  categories: Option[]; units: UnitOption[]; brands: string[]; canEditPrice: boolean; canUploadImages: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [name, setName] = useState("");
  const [sellingName, setSellingName] = useState("");
  const [sellingTouched, setSellingTouched] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function addTag() {
    const t = tagText.trim();
    if (!t) return;
    if (t.length > 30) return setMsg({ ok: false, text: "A tag is longer than 30 letters." });
    if (tags.length >= 20) return setMsg({ ok: false, text: "At most 20 tags." });
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setTagText("");
  }

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_IMAGES) { problems.push(`Only ${MAX_IMAGES} images are allowed.`); break; }
      const q = checkDeclaredFile(f.type, f.size);
      if (!q.ok || q.kind !== "image") { problems.push(`${f.name}: ${q.ok ? "only JPG, PNG or WebP." : q.message}`); continue; }
      const url = URL.createObjectURL(f);
      urlsRef.current.push(url);
      next.push({ file: f, url });
    }
    setFiles(next);
    setMsg(problems.length ? { ok: false, text: problems.join(" ") } : null);
  }

  async function submit(draft: boolean) {
    const form = formRef.current;
    if (!form || busy) return;
    const fd = new FormData(form);
    if (!String(fd.get("itemName") ?? "").trim() || !String(fd.get("internalItemCode") ?? "").trim()) {
      return setMsg({ ok: false, text: "Product Name and Product Code (SKU) are required." });
    }
    if (!draft && !fd.get("categoryId")) return setMsg({ ok: false, text: "Choose a Category (or use Save as Draft)." });
    fd.set("draft", draft ? "true" : "false");
    setBusy(true);
    setMsg(null);
    const res = await createProduct(fd);
    if (!res.ok) {
      setBusy(false);
      return setMsg({ ok: false, text: res.message });
    }
    // The product exists now: send the chosen images one by one (the first is the Main image).
    const problems: string[] = res.warn ? [res.warn] : [];
    for (const { file } of files) {
      try {
        const ticket = await requestUpload({ itemId: res.id, size: file.size, contentType: file.type });
        if (!ticket.ok) { problems.push(`${file.name}: ${ticket.message}`); continue; }
        const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
        if (error) { problems.push(`${file.name}: upload failed.`); continue; }
        const done = await confirmUpload({ itemId: res.id, path: ticket.path });
        if (!done.ok) problems.push(`${file.name}: ${done.message}`);
      } catch {
        problems.push(`${file.name}: upload failed.`);
      }
    }
    if (problems.length === 0) return router.push(`/items/${res.id}`);
    setBusy(false);
    setMsg({ ok: false, text: `The product was saved, but: ${problems.join(" ")}`, link: `/items/${res.id}` });
  }

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="mx-auto max-w-3xl space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted">Master Data / Product / SKU / Add Product</p>
          <h1 className="text-xl font-semibold">Add Product</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/items" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm hover:bg-surface-muted"><ArrowLeft size={16} aria-hidden /> Back</Link>
          <button type="button" disabled={busy} onClick={() => void submit(true)} className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm hover:bg-surface-muted disabled:opacity-60">Save as Draft</button>
          <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-strong disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Product
          </button>
        </div>
      </header>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>
          {msg.text} {msg.link && <Link href={msg.link} className="font-medium underline">Open the product</Link>}
        </p>
      )}

      <section className={card}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lab}>Product Name *</span>
            <input name="itemName" maxLength={200} value={name} placeholder="Product name" className={field}
              onChange={(e) => { setName(e.target.value); if (!sellingTouched) setSellingName(e.target.value); }} /></label>
          <label className="block"><span className={lab}>Product Code (SKU) *</span>
            <input name="internalItemCode" maxLength={120} placeholder="Product code" className={field} /></label>
          <label className="block"><span className={lab}>Category *</span>
            <select name="categoryId" defaultValue="" className={field}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <label className="block"><span className={lab}>Unit *</span>
            <select name="unit" defaultValue="PCS" className={field}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.code} - {u.name}</option>)}
            </select></label>
          <label className="block"><span className={lab}>Brand</span>
            <input name="brand" maxLength={100} list="brand-list" placeholder="Brand" className={field} />
            <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist></label>
          <label className="block"><span className={lab}>Selling price (₹ per unit)</span>
            <input name="sellingPrice" inputMode="decimal" maxLength={11} disabled={!canEditPrice} placeholder={canEditPrice ? "0.00" : "No permission"} className={field} /></label>
        </div>
        <label className="mt-3 block"><span className={lab}>Short Description</span>
          <textarea name="shortDescription" rows={2} maxLength={500} placeholder="One or two lines (optional)" className={area} /></label>

        <div className="mt-3">
          <span className={lab}>Images (up to {MAX_IMAGES}, JPG / PNG / WebP, 5 MB each; the first is the Main image)</span>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
              <div key={f.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.file.name} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand text-center text-[10px] text-white">Main</span>}
                <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><X size={12} aria-hidden /></button>
              </div>
            ))}
            {files.length < MAX_IMAGES && (
              <label title={canUploadImages ? "Add images" : "Needs the item edit right"}
                className={`inline-flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-strong)] text-xs text-muted ${canUploadImages ? "cursor-pointer hover:bg-surface-muted" : "opacity-50"}`}>
                <ImagePlus size={20} aria-hidden />Add
                <input type="file" multiple accept={ACCEPT_IMAGES} disabled={!canUploadImages} className="sr-only"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3">
          <Check name="isActive" label="Active" hint="Switch off to keep it hidden" />
          <Check name="showInSales" label="Show in Sales Order" hint="Off: it cannot be put on a sales order" />
          <Check name="showInPurchase" label="Show in Purchase Order" hint="Off: it cannot be put on a purchase order" />
          <Check name="lowStockAlert" label="Low Stock Alert" hint="Off: never shown as low stock or in the reorder list" />
          <Check name="generateBarcode" label="Make a SETMI barcode" hint="EAN-13, you can print it later" />
        </div>
      </section>

      <details className={`${card} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          More details (optional)
          <ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block"><span className={lab}>Sub Category</span><input name="subCategory" maxLength={100} className={field} /></label>
          <label className="block"><span className={lab}>HSN Code (only stored)</span><input name="hsnCode" inputMode="numeric" maxLength={20} className={field} /></label>
          <label className="block"><span className={lab}>Model / Part No.</span><input name="modelNo" maxLength={100} className={field} /></label>
          <label className="block"><span className={lab}>Product Type</span><input name="productType" maxLength={100} list="type-list" className={field} />
            <datalist id="type-list"><option value="Finished Goods" /><option value="Raw Material" /><option value="Component" /><option value="Accessory" /><option value="Consumable" /></datalist></label>
          <label className="block"><span className={lab}>Material</span><input name="material" maxLength={100} className={field} /></label>
          <label className="block"><span className={lab}>Color</span><input name="color" maxLength={100} className={field} /></label>
          <div><span className={lab}>Net Weight</span>
            <div className="flex gap-2">
              <input name="netWeight" inputMode="decimal" maxLength={12} aria-label="Net weight" className={field} />
              <select name="weightUnit" defaultValue="kg" aria-label="Weight unit" className={`${field} !w-20 shrink-0`}><option value="g">g</option><option value="kg">kg</option></select>
            </div></div>
          <div className="sm:col-span-2"><span className={lab}>Size (L × W × H)</span>
            <div className="flex gap-2">
              <input name="dimL" inputMode="decimal" maxLength={12} placeholder="L" aria-label="Length" className={field} />
              <input name="dimW" inputMode="decimal" maxLength={12} placeholder="W" aria-label="Width" className={field} />
              <input name="dimH" inputMode="decimal" maxLength={12} placeholder="H" aria-label="Height" className={field} />
              <select name="dimUnit" defaultValue="cm" aria-label="Size unit" className={`${field} !w-20 shrink-0`}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option></select>
            </div></div>
          <label className="block"><span className={lab}>Country of Origin</span><input name="countryOfOrigin" maxLength={100} className={field} /></label>
          <label className="block"><span className={lab}>Shelf Life / Warranty</span><input name="shelfLife" maxLength={100} className={field} /></label>
          <label className="block"><span className={lab}>Barcode (manufacturer)</span><input name="barcodes" maxLength={64} className={field} /></label>
          <label className="block"><span className={lab}>Purchase Source</span>
            <select name="purchaseSource" defaultValue="LOCAL" className={field}><option value="LOCAL">LOCAL (Indian supplier)</option><option value="IMPORT">IMPORT (foreign supplier)</option></select></label>
          <label className="block"><span className={lab}>Import Item Code</span><input name="importItemCode" maxLength={64} className={field} /></label>
          <label className="block"><span className={lab}>Selling Item Name (on bills)</span>
            <input name="sellingItemName" maxLength={200} value={sellingName} placeholder="Same as Product Name" className={field}
              onChange={(e) => { setSellingName(e.target.value); setSellingTouched(true); }} /></label>
          <label className="block"><span className={lab}>Min. Order Qty</span><input name="moq" inputMode="decimal" maxLength={12} className={field} /></label>
          <label className="block"><span className={lab}>Lead Time (days)</span><input name="leadTimeDays" inputMode="numeric" maxLength={4} className={field} /></label>
          <label className="block"><span className={lab}>Safety factor (empty = 1.5)</span><input name="safetyFactor" inputMode="decimal" maxLength={5} className={field} /></label>
        </div>
        <label className="mt-3 block"><span className={lab}>Detailed Description</span>
          <textarea name="detailedDescription" rows={3} maxLength={2000} className={area} /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><span className={lab}>Tags</span>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--line-strong)] bg-surface p-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-[var(--brand-text)]">
                  {t}<input type="hidden" name="tags" value={t} />
                  <button type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><X size={12} aria-hidden /></button>
                </span>
              ))}
              <input value={tagText} maxLength={30} placeholder="Type a tag, press Enter" aria-label="New tag" className="min-w-[8rem] flex-1 bg-transparent text-base outline-none sm:text-sm"
                onChange={(e) => setTagText(e.target.value)} onBlur={addTag}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} />
            </div></div>
          <label className="block"><span className={lab}>Search Keywords</span><textarea name="searchKeywords" rows={2} maxLength={500} className={area} /></label>
        </div>
        <label className="mt-3 block"><span className={lab}>Remarks</span><textarea name="remarks" rows={2} maxLength={500} className={area} /></label>
      </details>
    </form>
  );
}
