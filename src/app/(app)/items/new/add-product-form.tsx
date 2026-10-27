"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, Plus, Save, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_IMAGES, BUCKET, MAX_IMAGES, checkDeclaredFile } from "@/lib/validation/files";
import { confirmUpload, requestUpload } from "../[id]/file-actions";
import { createProduct } from "../actions";

type Option = { id: string; name: string };
type UnitOption = { code: string; name: string };

const field = "min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-base shadow-sm placeholder:text-muted disabled:opacity-60 sm:min-h-10 sm:text-sm";
const area = "w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 py-2 text-base shadow-sm placeholder:text-muted sm:text-sm";
const card = "rounded-xl border border-line bg-surface p-4 shadow-sm";
const cardTitle = "mb-3 text-sm font-semibold";
const lab = "mb-1 block text-xs font-medium text-muted";

const TABS = [
  "Basic Information", "Specifications", "Inventory & Stock", "Pricing", "Supplier & Purchase", "Images & Documents", "Variants / SKUs", "SEO & Other",
] as const;
const NOT_BUILT = new Set([6, 7]);

function Counter({ n, max }: { n: number; max: number }) {
  return <span className="text-xs text-muted">{n}/{max}</span>;
}

function Toggle({ name, label, hint, defaultOn }: { name: string; label: string; hint: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" name={name} checked={on} onChange={(e) => setOn(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand" : "bg-[var(--line-strong)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}

export function AddProductForm({ categories, units, brands, canEditPrice, canUploadImages }: {
  categories: Option[]; units: UnitOption[]; brands: string[]; canEditPrice: boolean; canUploadImages: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const brandRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  const [name, setName] = useState("");
  const [sellingName, setSellingName] = useState("");
  const [sellingTouched, setSellingTouched] = useState(false);
  const [unit, setUnit] = useState("PCS");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagText, setTagText] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [drag, setDrag] = useState(false);
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
      setTab(0);
      return setMsg({ ok: false, text: "Product Name and Product Code (SKU) are required." });
    }
    if (!draft && (!fd.get("categoryId") || !String(fd.get("shortDescription") ?? "").trim())) {
      setTab(0);
      return setMsg({ ok: false, text: "Category and Short Description are required (or use Save as Draft)." });
    }
    fd.set("draft", draft ? "true" : "false");
    setBusy(true);
    setMsg(null);
    const res = await createProduct(fd);
    if (!res.ok) {
      setBusy(false);
      return setMsg({ ok: false, text: res.message });
    }
    // The item exists now: send the chosen images one by one (the first is the Main image).
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
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Master Data / Product / SKU / Add Product</p>
          <h1 className="text-xl font-semibold">Add Product / SKU</h1>
          <p className="text-sm text-muted">Create a new product and its details.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/items" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm hover:bg-surface-muted sm:min-h-10"><ArrowLeft size={16} aria-hidden /> Back to Products</Link>
          <button type="button" disabled={busy} onClick={() => void submit(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm hover:bg-surface-muted disabled:opacity-60 sm:min-h-10">Save as Draft</button>
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-strong disabled:opacity-60 sm:min-h-10">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Product
          </button>
        </div>
      </header>

      <nav aria-label="Product sections" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t, i) => (
          <button key={t} type="button" onClick={() => setTab(i)} aria-current={tab === i ? "page" : undefined}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium sm:min-h-10 ${tab === i ? "border-brand text-[var(--brand-text)]" : "border-transparent text-muted hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </nav>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>
          {msg.text} {msg.link && <Link href={msg.link} className="font-medium underline">Open the product</Link>}
        </p>
      )}

      {/* ---------- 1. Basic Information ---------- */}
      <div className={tab === 0 ? "grid gap-4 lg:grid-cols-3" : "hidden"}>
        <div className="space-y-4 lg:col-span-2">
          <section className={card}>
            <h2 className={cardTitle}>Basic Product Information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={lab}>Product Name *</span>
                <input name="itemName" maxLength={200} value={name} placeholder="Enter product name" className={field}
                  onChange={(e) => { setName(e.target.value); if (!sellingTouched) setSellingName(e.target.value); }} /></label>
              <label className="block"><span className={lab}>Product Code (SKU) *</span>
                <input name="internalItemCode" maxLength={120} placeholder="Enter product code" className={field} /></label>
              <label className="block"><span className={lab}>Category *</span>
                <select name="categoryId" defaultValue="" className={field}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></label>
              <label className="block"><span className={lab}>Sub Category</span>
                <input name="subCategory" maxLength={100} placeholder="Select sub category" className={field} /></label>
              <label className="block"><span className={lab}>Brand</span>
                <div className="flex gap-2">
                  <input ref={brandRef} name="brand" maxLength={100} list="brand-list" placeholder="Select or type a brand" className={field} />
                  <button type="button" title="Type a new brand name to add it" aria-label="Add a new brand" onClick={() => brandRef.current?.focus()}
                    className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted sm:min-h-10"><Plus size={16} aria-hidden /></button>
                </div>
                <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist></label>
              <label className="block"><span className={lab}>HSN Code</span>
                <input name="hsnCode" inputMode="numeric" maxLength={20} placeholder="Enter HSN code" className={field} /></label>
            </div>
            <label className="mt-3 block">
              <span className={`${lab} flex justify-between`}><span>Short Description *</span><Counter n={shortDesc.length} max={500} /></span>
              <textarea name="shortDescription" rows={3} maxLength={500} value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="Enter a short description" className={area} />
            </label>
            <label className="mt-3 block">
              <span className={`${lab} flex justify-between`}><span>Detailed Description</span><Counter n={longDesc.length} max={2000} /></span>
              <textarea name="detailedDescription" rows={6} maxLength={2000} value={longDesc} onChange={(e) => setLongDesc(e.target.value)} placeholder="Enter the detailed description (plain text)" className={area} />
            </label>
          </section>

          <section className={card}>
            <h2 className={cardTitle}>Key Attributes</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className={lab}>Product Type</span>
                <input name="productType" maxLength={100} list="type-list" placeholder="Select product type" className={field} />
                <datalist id="type-list"><option value="Finished Goods" /><option value="Raw Material" /><option value="Component" /><option value="Accessory" /><option value="Consumable" /></datalist></label>
              <label className="block"><span className={lab}>Material</span>
                <input name="material" maxLength={100} placeholder="Enter material" className={field} /></label>
              <label className="block"><span className={lab}>Color</span>
                <input name="color" maxLength={100} placeholder="Enter color" className={field} /></label>
              <div><span className={lab}>Net Weight</span>
                <div className="flex gap-2">
                  <input name="netWeight" inputMode="decimal" maxLength={12} placeholder="0.00" aria-label="Net weight" className={field} />
                  <select name="weightUnit" defaultValue="kg" aria-label="Weight unit" className={`${field} w-24 shrink-0`}><option value="g">g</option><option value="kg">kg</option></select>
                </div></div>
              <div className="sm:col-span-2"><span className={lab}>Dimensions (L × W × H)</span>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                  <input name="dimL" inputMode="decimal" maxLength={12} placeholder="L" aria-label="Length" className={field} />
                  <input name="dimW" inputMode="decimal" maxLength={12} placeholder="W" aria-label="Width" className={field} />
                  <input name="dimH" inputMode="decimal" maxLength={12} placeholder="H" aria-label="Height" className={field} />
                  <select name="dimUnit" defaultValue="cm" aria-label="Size unit" className={`${field} w-24 shrink-0`}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option></select>
                </div></div>
              <label className="block"><span className={lab}>Country of Origin</span>
                <input name="countryOfOrigin" maxLength={100} placeholder="Select country" className={field} /></label>
              <label className="block"><span className={lab}>Model / Part No.</span>
                <input name="modelNo" maxLength={100} placeholder="Enter model / part number" className={field} /></label>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className={card}>
            <h2 className={cardTitle}>Product Images</h2>
            {!canUploadImages && <p className="mb-2 text-xs text-muted">You may create products but not add images (needs the item edit right).</p>}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (canUploadImages) addFiles(e.dataTransfer.files); }}
              className={`rounded-lg border-2 border-dashed p-4 text-center ${drag ? "border-brand bg-brand-soft" : "border-[var(--line-strong)]"}`}>
              <ImagePlus size={28} className="mx-auto text-muted" aria-hidden />
              <p className="mt-1 text-sm">Drag and drop images here, or</p>
              <label className={`mt-2 inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm ${canUploadImages ? "cursor-pointer hover:bg-surface-muted" : "opacity-50"}`}>
                Browse Files
                <input type="file" multiple accept={ACCEPT_IMAGES} disabled={!canUploadImages} className="sr-only"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <p className="mt-2 text-xs text-muted">JPG, PNG or WebP, max 5 MB each, up to {MAX_IMAGES} images. The first image is the Main image.</p>
            </div>
            {files.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {files.map((f, i) => (
                  <li key={f.url} className="relative overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.file.name} className="aspect-square w-full object-cover" />
                    {i === 0 && <span className="absolute left-1 top-1 rounded bg-brand px-1.5 text-[10px] font-medium text-white">Main</span>}
                    <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"><X size={14} aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className={cardTitle}>Status & Visibility</h2>
            <div className="divide-y divide-[var(--line)]">
              <Toggle name="isActive" label="Active Product" hint="Switch off to keep it hidden" defaultOn />
              <Toggle name="showInSales" label="Show in Sales Order" hint="Off: it cannot be put on a sales order" defaultOn />
              <Toggle name="showInPurchase" label="Show in Purchase Order" hint="Off: it cannot be put on a purchase order" defaultOn />
              <Toggle name="lowStockAlert" label="Low Stock Alert" hint="Off: never shown as low stock or in the reorder list" defaultOn />
            </div>
          </section>

          <section className={card}>
            <h2 className={cardTitle}>Tags & Keywords</h2>
            <span className={lab}>Tags</span>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-[var(--line-strong)] bg-surface p-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-[var(--brand-text)]">
                  {t}<input type="hidden" name="tags" value={t} />
                  <button type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><X size={12} aria-hidden /></button>
                </span>
              ))}
              <input value={tagText} maxLength={30} placeholder="Add tag and press Enter" aria-label="New tag" className="min-w-[8rem] flex-1 bg-transparent text-base outline-none sm:text-sm"
                onChange={(e) => setTagText(e.target.value)} onBlur={addTag}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} />
            </div>
            <label className="mt-3 block">
              <span className={`${lab} flex justify-between`}><span>Search Keywords</span><Counter n={keywords.length} max={500} /></span>
              <textarea name="searchKeywords" rows={3} maxLength={500} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Enter keywords separated by commas" className={area} />
            </label>
          </section>
        </div>

        <section className={`${card} lg:col-span-3`}>
          <h2 className={cardTitle}>Additional Information</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className={lab}>Barcode</span>
              <input name="barcodes" maxLength={64} placeholder="Enter manufacturer barcode" className={field} /></label>
            <div><span className={lab}>Minimum Order Quantity</span>
              <div className="flex gap-2">
                <input name="moq" inputMode="decimal" maxLength={12} placeholder="0" aria-label="Minimum order quantity" className={field} />
                <span className={`${field} flex w-20 shrink-0 items-center bg-surface-muted`} title="Change the unit in the Specifications tab">{unit}</span>
              </div></div>
            <label className="block"><span className={lab}>Shelf Life / Warranty</span>
              <input name="shelfLife" maxLength={100} placeholder="e.g. 12 months" className={field} /></label>
            <div><span className={lab}>Lead Time</span>
              <div className="flex gap-2">
                <input name="leadTimeDays" inputMode="numeric" maxLength={4} placeholder="0" aria-label="Lead time" className={field} />
                <span className={`${field} flex w-20 shrink-0 items-center bg-surface-muted`}>Days</span>
              </div></div>
          </div>
          <label className="mt-3 block">
            <span className={`${lab} flex justify-between`}><span>Remarks</span><Counter n={remarks.length} max={500} /></span>
            <textarea name="remarks" rows={2} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Enter any remarks" className={area} />
          </label>
        </section>
      </div>

      {/* ---------- 2. Specifications ---------- */}
      <section className={tab === 1 ? card : "hidden"}>
        <h2 className={cardTitle}>Specifications</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lab}>Unit of measure *</span>
            <select name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={field}>
              {units.map((u) => <option key={u.code} value={u.code}>{u.code} - {u.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-muted">How stock is counted. Metres allow decimals, pieces do not. It cannot be changed once the item has stock.</span></label>
        </div>
        <p className="mt-3 text-xs text-muted">Size, weight, material, colour and country are filled in the Basic Information tab, under Key Attributes.</p>
      </section>

      {/* ---------- 3. Inventory & Stock ---------- */}
      <section className={tab === 2 ? card : "hidden"}>
        <h2 className={cardTitle}>Inventory & Stock</h2>
        <p className="mb-3 text-sm text-muted">Stock quantity is never typed here. It comes only from receiving, transfers, counts and sales. Minimum and maximum levels per place are set later on the Reorder levels screen.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lab}>Safety factor (empty = 1.5)</span>
            <input name="safetyFactor" inputMode="decimal" maxLength={5} placeholder="1.5" className={field} />
            <span className="mt-1 block text-xs text-muted">Used with Lead Time (Basic Information) in the reorder suggestion.</span></label>
          <label className="flex items-start gap-2 pt-5 text-sm">
            <input type="checkbox" name="generateBarcode" defaultChecked className="mt-1" />
            <span>Make a SETMI barcode (EAN-13) for this product. You can print it later.</span>
          </label>
        </div>
      </section>

      {/* ---------- 4. Pricing ---------- */}
      <section className={tab === 3 ? card : "hidden"}>
        <h2 className={cardTitle}>Pricing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lab}>Selling Item Name (printed on bills)</span>
            <input name="sellingItemName" maxLength={200} value={sellingName} placeholder="Same as Product Name if left alone" className={field}
              onChange={(e) => { setSellingName(e.target.value); setSellingTouched(true); }} /></label>
          <label className="block"><span className={lab}>Selling price (rupees per unit)</span>
            <input name="sellingPrice" inputMode="decimal" maxLength={11} disabled={!canEditPrice} placeholder="0.00" className={field} />
            <span className="mt-1 block text-xs text-muted">{canEditPrice ? "Used when billing is switched on. No tax is calculated. The HSN code is only stored." : "You do not have permission to set the price."}</span></label>
        </div>
      </section>

      {/* ---------- 5. Supplier & Purchase ---------- */}
      <section className={tab === 4 ? card : "hidden"}>
        <h2 className={cardTitle}>Supplier & Purchase</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className={lab}>Purchase Source *</span>
            <select name="purchaseSource" defaultValue="LOCAL" className={field}>
              <option value="LOCAL">LOCAL (Indian supplier)</option>
              <option value="IMPORT">IMPORT (foreign supplier)</option>
            </select></label>
          <label className="block"><span className={lab}>Import Item Code</span>
            <input name="importItemCode" maxLength={64} placeholder="Code used by the foreign supplier" className={field} /></label>
        </div>
        <p className="mt-3 text-xs text-muted">Minimum Order Quantity and Lead Time are in the Basic Information tab. Suppliers are chosen on each purchase order.</p>
      </section>

      {/* ---------- 6. Images & Documents ---------- */}
      <section className={tab === 5 ? card : "hidden"}>
        <h2 className={cardTitle}>Images & Documents</h2>
        <p className="text-sm text-muted">Product images are chosen in the Basic Information tab (right side). The datasheet (PDF, max 10 MB) can be added on the product page after saving.</p>
      </section>

      {/* ---------- 7, 8: not built ---------- */}
      {NOT_BUILT.has(tab) && (
        <section className={card}>
          <h2 className={cardTitle}>{TABS[tab]}</h2>
          <p className="text-sm text-muted">Not built yet. Nothing is saved from this tab.</p>
        </section>
      )}
    </form>
  );
}
