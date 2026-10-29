"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronRight, CircleDollarSign, FileText, ImagePlus, Images, LayoutGrid, ListChecks, Loader2, Package, Save, Settings, ShoppingCart, Warehouse, Wand2, X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/badge";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_IMAGES, BUCKET, MAX_IMAGES, checkDeclaredFile } from "@/lib/validation/files";
import { confirmUpload, requestUpload } from "../[id]/file-actions";
import { createProduct, suggestSku } from "../actions";

type Option = { id: string; name: string };
type UnitOption = { code: string; name: string };

const field = "min-h-10 w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-base shadow-sm placeholder:text-muted disabled:opacity-60 sm:text-sm";
const area = "w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 py-2 text-base shadow-sm placeholder:text-muted sm:text-sm";
const card = "rounded-xl border border-line bg-surface p-4 shadow-sm";
const lab = "mb-1 block text-xs font-medium text-muted";

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Basic Information", icon: FileText },
  { id: "specs", label: "Specifications", icon: ListChecks },
  { id: "stock", label: "Inventory & Stock", icon: Warehouse },
  { id: "pricing", label: "Pricing", icon: CircleDollarSign },
  { id: "purchase", label: "Supplier & Purchase", icon: ShoppingCart },
  { id: "media", label: "Images & Documents", icon: Images },
  { id: "variants", label: "Variants / SKUs", icon: LayoutGrid },
  { id: "seo", label: "SEO & Other", icon: Settings },
];

function Check({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm" title={hint}>
      <input type="checkbox" name={name} defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
      <span><span className="block font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
    </label>
  );
}

function Section({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} ${className}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

// Things in the owner's mock that the system does not have yet. Said plainly, no fake boxes.
function NotBuilt({ title, items, note }: { title: string; items: string; note?: string }) {
  return (
    <section className="rounded-xl border border-dashed border-[var(--line-strong)] bg-surface-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2><Badge tone="gray">Not built yet</Badge></div>
      <p className="mt-2 text-sm text-muted">{items}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </section>
  );
}

// Add Product: eight tabs like the owner's mock. Every box of every tab stays in the same form (a hidden tab is only hidden, not removed),
// so Save Product always sends everything. Parts that need new database tables are shown as "Not built yet".
export type DuplicateSource = {
  fromCode: string;
  values: Record<string, string | number | null>;
  tags: string[];
  flags: { isActive: boolean; showInSales: boolean; showInPurchase: boolean; lowStockAlert: boolean };
};

export function AddProductForm({ categories, units, brands, canEditPrice, canUploadImages, initial }: {
  categories: Option[]; units: UnitOption[]; brands: string[]; canEditPrice: boolean; canUploadImages: boolean; initial?: DuplicateSource | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState("basic");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [name, setName] = useState(String(initial?.values.itemName ?? ""));
  const [sellingName, setSellingName] = useState(String(initial?.values.sellingItemName ?? ""));
  const [sellingTouched, setSellingTouched] = useState(Boolean(initial));
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [skuBusy, setSkuBusy] = useState(false);
  const [tagText, setTagText] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [preview, setPreview] = useState({ code: "", category: "", brand: "", hsn: "", unit: "PCS", price: "" });
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // The preview card on the right follows the boxes. Read from the form, so a duplicated product is shown too.
  function syncPreview() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const text = (k: string) => String(fd.get(k) ?? "");
    // The person is fixing the boxes: an old error message has done its job. A "saved, but..." message with a link stays.
    setMsg((m) => (m && !m.ok && !m.link ? null : m));
    setPreview({
      code: text("internalItemCode"), category: categories.find((c) => c.id === text("categoryId"))?.name ?? "", brand: text("brand"),
      hsn: text("hsnCode"), unit: text("unit"), price: text("sellingPrice"),
    });
  }

  // Duplicate: put the copied details into the boxes (they are plain boxes, so this sets them once when the page opens).
  useEffect(() => {
    const form = formRef.current;
    if (!form || !initial) return;
    for (const [k, v] of Object.entries(initial.values)) {
      if (k === "itemName" || k === "sellingItemName" || v === null || v === "") continue;
      const el = form.elements.namedItem(k);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) el.value = String(v);
    }
    for (const [k, v] of Object.entries(initial.flags)) {
      const el = form.elements.namedItem(k);
      if (el instanceof HTMLInputElement) el.checked = v;
    }
    syncPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fillSku() {
    const cat = String(new FormData(formRef.current!).get("categoryId") ?? "");
    setSkuBusy(true);
    const r = await suggestSku(cat);
    setSkuBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    const el = formRef.current!.elements.namedItem("internalItemCode");
    if (el instanceof HTMLInputElement) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, r.sku);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setMsg(null);
  }

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
      setTab("basic");
      return setMsg({ ok: false, text: "Product Name and Product Code (SKU) are required." });
    }
    if (!draft && !fd.get("categoryId")) {
      setTab("basic");
      return setMsg({ ok: false, text: "Choose a Category (or use Save as Draft)." });
    }
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

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  const panel = (id: string) => ({ id: `panel-${id}`, role: "tabpanel" as const, "aria-labelledby": `tab-${id}`, hidden: tab !== id });

  return (
    <form ref={formRef} onChange={syncPreview} onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link><ChevronRight size={14} aria-hidden /><span>Master Data</span><ChevronRight size={14} aria-hidden />
            <Link href="/items">Products / SKU</Link><ChevronRight size={14} aria-hidden /><span className="font-medium text-[var(--foreground)]">{initial ? "Duplicate Product" : "Add Product"}</span>
          </nav>
          <h1 className="!text-3xl !font-bold">{initial ? "Duplicate Product" : "Add Product / SKU"}</h1>
          <p className="mt-1 text-sm text-muted">
            {initial ? `Copy of ${initial.fromCode}. Give it a new code. Pictures and barcodes are not copied.` : "Create a new product, add SKU details, specifications, images and set inventory and purchasing information."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/items" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold shadow-sm hover:bg-surface-muted"><ArrowLeft size={16} aria-hidden /> Back to Products</Link>
          <button type="button" disabled={busy} onClick={() => void submit(true)} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-60">Save as Draft</button>
          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-strong disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Product
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="Product sections" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1.5 shadow-sm md:flex-wrap md:overflow-visible">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium ${tab === t.id ? "bg-brand-soft text-[var(--brand-text)] shadow-sm" : "text-muted hover:bg-surface-muted hover:text-[var(--foreground)]"}`}>
            <t.icon size={17} aria-hidden />{t.label}
          </button>
        ))}
      </div>

      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300" : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"}`}>
          {msg.text} {msg.link && <Link href={msg.link} className="font-medium underline">Open the product</Link>}
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {/* 1. Basic Information */}
          <div {...panel("basic")} className="grid gap-4 lg:grid-cols-2">
            <Section title="Basic Product Information" hint="Enter basic details about the product.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2"><span className={lab}>Product Name *</span>
                  <input name="itemName" maxLength={200} value={name} placeholder="Product name" className={field}
                    onChange={(e) => { setName(e.target.value); if (!sellingTouched) setSellingName(e.target.value); }} /></label>
                <div><span className={lab}>Product Code (SKU) *</span>
                  <div className="flex gap-2">
                    <input name="internalItemCode" maxLength={120} placeholder="Product code" aria-label="Product code" className={field} />
                    <button type="button" onClick={() => void fillSku()} disabled={skuBusy} title="Suggest a free code from the category (choose the category first)" aria-label="Suggest a product code"
                      className="inline-flex min-h-10 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted disabled:opacity-60">
                      {skuBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Wand2 size={16} aria-hidden />}
                    </button>
                  </div></div>
                <label className="block"><span className={lab}>Unit *</span>
                  <select name="unit" defaultValue="PCS" className={field}>
                    {units.map((u) => <option key={u.code} value={u.code}>{u.code} - {u.name}</option>)}
                  </select></label>
                <label className="block"><span className={lab}>Category *</span>
                  <select name="categoryId" defaultValue="" className={field}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></label>
                <label className="block"><span className={lab}>Sub Category</span><input name="subCategory" maxLength={100} className={field} /></label>
                <label className="block"><span className={lab}>Brand</span>
                  <input name="brand" maxLength={100} list="brand-list" placeholder="Brand" className={field} />
                  <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist></label>
                <label className="block"><span className={lab}>HSN Code (only stored, no tax is calculated)</span><input name="hsnCode" inputMode="numeric" maxLength={20} className={field} /></label>
              </div>
              <label className="mt-3 block"><span className={lab}>Short Description</span>
                <textarea name="shortDescription" rows={2} maxLength={500} placeholder="One or two lines (optional)" className={area} /></label>
              <label className="mt-3 block"><span className={lab}>Detailed Description (plain text)</span>
                <textarea name="detailedDescription" rows={5} maxLength={2000} className={area} /></label>
            </Section>

            <div className="space-y-4">
              <Section title="Product Images" hint={`Up to ${MAX_IMAGES} images, JPG / PNG / WebP, 5 MB each. The first one is the Main image.`}>
                <div className="flex flex-wrap items-center gap-2">
                  {files.map((f, i) => (
                    <div key={f.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.file.name} className="h-full w-full object-cover" />
                      {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand text-center text-[10px] text-white">Main</span>}
                      <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"><X size={12} aria-hidden /></button>
                    </div>
                  ))}
                  {files.length < MAX_IMAGES && (
                    <label title={canUploadImages ? "Add images" : "Needs the item edit right"}
                      className={`inline-flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-strong)] text-xs text-muted ${canUploadImages ? "cursor-pointer hover:bg-surface-muted" : "opacity-50"}`}>
                      <ImagePlus size={22} aria-hidden />Add
                      <input type="file" multiple accept={ACCEPT_IMAGES} disabled={!canUploadImages} className="sr-only"
                        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </Section>

              <Section title="Status & Visibility" hint="Set product status and visibility options.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Check name="isActive" label="Active Product" hint="Switch off to keep it hidden." />
                  <Check name="showInSales" label="Show in Sales Order" hint="Off: it cannot be put on a sales order." />
                  <Check name="showInPurchase" label="Show in Purchase Order" hint="Off: it cannot be put on a purchase order." />
                  <Check name="lowStockAlert" label="Low Stock Alert" hint="Off: never shown as low stock or in the reorder list." />
                </div>
              </Section>
            </div>

            <Section title="Tags & Keywords" hint="Add tags and keywords for better search.">
              <span className={lab}>Tags (press Enter to add)</span>
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
              </div>
              <label className="mt-3 block"><span className={lab}>Search Keywords</span><textarea name="searchKeywords" rows={3} maxLength={500} className={area} /></label>
            </Section>

            <Section title="Additional Information" hint="Set additional details.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>Barcode (from the manufacturer)</span><input name="barcodes" maxLength={64} className={field} /></label>
                <div className="flex items-end"><Check name="generateBarcode" label="Make a SETMI barcode" hint="EAN-13, you can print it later." /></div>
              </div>
              <label className="mt-3 block"><span className={lab}>Remarks</span><textarea name="remarks" rows={2} maxLength={500} className={area} /></label>
            </Section>
          </div>

          {/* 2. Specifications */}
          <div {...panel("specs")} className="grid gap-4 lg:grid-cols-2">
            <Section title="General Specifications" hint="Technical and physical details of the product.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>Product Type</span><input name="productType" maxLength={100} list="type-list" className={field} />
                  <datalist id="type-list"><option value="Finished Goods" /><option value="Raw Material" /><option value="Component" /><option value="Accessory" /><option value="Consumable" /></datalist></label>
                <label className="block"><span className={lab}>Material</span><input name="material" maxLength={100} className={field} /></label>
                <label className="block"><span className={lab}>Color</span><input name="color" maxLength={100} className={field} /></label>
                <label className="block"><span className={lab}>Model / Part No.</span><input name="modelNo" maxLength={100} className={field} /></label>
                <div><span className={lab}>Net Weight</span>
                  <div className="flex gap-2">
                    <input name="netWeight" inputMode="decimal" maxLength={12} aria-label="Net weight" className={field} />
                    <select name="weightUnit" defaultValue="kg" aria-label="Weight unit" className={`${field} !w-20 shrink-0`}><option value="g">g</option><option value="kg">kg</option></select>
                  </div></div>
                <label className="block"><span className={lab}>Country of Origin</span><input name="countryOfOrigin" maxLength={100} className={field} /></label>
                <div className="sm:col-span-2"><span className={lab}>Size (L × W × H)</span>
                  <div className="flex gap-2">
                    <input name="dimL" inputMode="decimal" maxLength={12} placeholder="L" aria-label="Length" className={field} />
                    <input name="dimW" inputMode="decimal" maxLength={12} placeholder="W" aria-label="Width" className={field} />
                    <input name="dimH" inputMode="decimal" maxLength={12} placeholder="H" aria-label="Height" className={field} />
                    <select name="dimUnit" defaultValue="cm" aria-label="Size unit" className={`${field} !w-20 shrink-0`}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option></select>
                  </div></div>
                <label className="block sm:col-span-2"><span className={lab}>Shelf Life / Warranty</span><input name="shelfLife" maxLength={100} className={field} /></label>
              </div>
            </Section>
            <NotBuilt title="More specifications" items="Technical specification table (name, value, unit), finish, shape, mounting type, operating temperature, voltage, current and IP ratings, compliance, gross weight, packaging and master carton details."
              note="These need new database columns or tables. Say which ones you want first." />
          </div>

          {/* 3. Inventory & Stock */}
          <div {...panel("stock")} className="grid gap-4 lg:grid-cols-2">
            <Section title="Inventory Details" hint="Stock rules that already work.">
              <label className="block"><span className={lab}>Reorder safety factor (empty = 1.5)</span><input name="safetyFactor" inputMode="decimal" maxLength={5} className={field} /></label>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                <li>Low Stock Alert is on the Basic Information tab.</li>
                <li>Lead time is on the Supplier & Purchase tab; together with the safety factor it sets the reorder quantity.</li>
                <li>Minimum and maximum stock for each warehouse or shop is set on the Stock screen after the product is saved.</li>
                <li>Opening stock: use Stock In on the Stock Entry screen after saving (a manager approves it).</li>
              </ul>
            </Section>
            <NotBuilt title="Batch, serial, expiry and default place" items="Batch number and serial number tracking, expiry date, default warehouse / zone / rack, storage type, live stock panels."
              note="Stock can never go below zero in this system, so an 'Allow negative stock' switch is not planned. Current stock and history are on the product page after saving." />
          </div>

          {/* 4. Pricing */}
          <div {...panel("pricing")} className="grid gap-4 lg:grid-cols-2">
            <Section title="Sales Pricing" hint="Price used on bills and sales orders.">
              <label className="block"><span className={lab}>Selling price (₹ per unit)</span>
                <input name="sellingPrice" inputMode="decimal" maxLength={11} disabled={!canEditPrice} placeholder={canEditPrice ? "0.00" : "No permission"} className={field} /></label>
              <label className="mt-3 block"><span className={lab}>Selling Item Name (printed on bills)</span>
                <input name="sellingItemName" maxLength={200} value={sellingName} placeholder="Same as Product Name" className={field}
                  onChange={(e) => { setSellingName(e.target.value); setSellingTouched(true); }} /></label>
            </Section>
            <NotBuilt title="More pricing" items="MRP, GST rate and tax category, prices per channel (Amazon, Flipkart, website, wholesale), discounts and offers, price history, landed cost and custom duty."
              note="GST waits for the accountant's rules. The buying cost comes from posted goods receipts and shows in the product list for people with the cost right." />
          </div>

          {/* 5. Supplier & Purchase */}
          <div {...panel("purchase")} className="grid gap-4 lg:grid-cols-2">
            <Section title="Default Purchase Settings" hint="Used by purchase orders and the reorder list.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={lab}>Purchase Source</span>
                  <select name="purchaseSource" defaultValue="LOCAL" className={field}><option value="LOCAL">LOCAL (Indian supplier)</option><option value="IMPORT">IMPORT (foreign supplier)</option></select></label>
                <label className="block"><span className={lab}>Import Item Code</span><input name="importItemCode" maxLength={64} className={field} /></label>
                <label className="block"><span className={lab}>Minimum Purchase Qty (MOQ)</span><input name="moq" inputMode="decimal" maxLength={12} className={field} /></label>
                <label className="block"><span className={lab}>Purchase Lead Time (days)</span><input name="leadTimeDays" inputMode="numeric" maxLength={4} className={field} /></label>
              </div>
            </Section>
            <NotBuilt title="Suppliers of this product" items="Primary and alternate suppliers per product, preferred supplier, purchase price history, supplier performance."
              note="Today the supplier is chosen on each purchase order." />
          </div>

          {/* 6. Images & Documents */}
          <div {...panel("media")} className="grid gap-4 lg:grid-cols-2">
            <Section title="Product Media Preview" hint="Pictures chosen on the Basic Information tab.">
              {files.length === 0 ? <p className="py-6 text-center text-sm text-muted">No picture chosen yet. Add them on the Basic Information tab.</p> : (
                <div className="grid grid-cols-3 gap-2">
                  {files.map((f, i) => (
                    <div key={f.url} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.file.name} className="h-full w-full object-contain" />
                      {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand text-center text-[10px] text-white">Main</span>}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setTab("basic")} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted">Go to images</button>
            </Section>
            <NotBuilt title="Documents" items="Several documents with names, types and notes (certificates, manuals, drawings), image captions."
              note="One PDF datasheet (up to 10 MB) can be added on the product page after saving." />
          </div>

          {/* 7. Variants / SKUs */}
          <div {...panel("variants")}>
            <NotBuilt title="Variants / SKUs" items="Making many SKUs from lengths, colours or sizes in one go, with their own prices, barcodes and stock."
              note="Today every size or colour is its own product. Use Duplicate on the product page to copy one quickly. Variants need a parent-product link in the database first." />
          </div>

          {/* 8. SEO & Other */}
          <div {...panel("seo")}>
            <NotBuilt title="SEO and marketplace" items="SEO title, meta description, URL slug, bullet-point highlights, Amazon / Flipkart / Meesho / Snapdeal titles and search terms."
              note="Tags and search keywords are on the Basic Information tab and already work for searching inside this system." />
          </div>
        </div>

        {/* Preview card, follows the boxes */}
        <aside aria-label="Product preview" className={`${card} h-fit xl:sticky xl:top-20`}>
          <h2 className="text-sm font-semibold">Product Preview</h2>
          <p className="mb-3 text-xs text-muted">How the product looks once saved.</p>
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
            {files[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={files[0].url} alt="Main image" className="h-full w-full object-contain" />
            ) : <Package size={56} aria-hidden className="text-muted" />}
          </div>
          <p className="mt-3 break-words text-base font-bold">{name || "Product name"}</p>
          <p className="break-words text-sm text-muted">{preview.code || "Product code"}</p>
          <dl className="mt-3 space-y-1 text-sm">
            {([["Category", preview.category], ["Brand", preview.brand], ["HSN Code", preview.hsn], ["Unit", preview.unit], ["Selling price", preview.price ? `₹${preview.price}` : ""]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-t border-line pt-1"><dt className="text-muted">{k}</dt><dd className="text-right">{v || "-"}</dd></div>
            ))}
          </dl>
          {tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-[var(--brand-text)]">{t}</span>)}</div>}
        </aside>
      </div>
    </form>
  );
}
