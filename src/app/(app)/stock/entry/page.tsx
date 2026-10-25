import Link from "next/link";
import { Badge } from "@/components/badge";
import { requirePermission } from "@/lib/auth";
import { getLang } from "@/lib/i18n";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { REASON_LABELS, type EntryReason } from "@/lib/validation/stock-entry";
import { EntryForm, type EntryLabels } from "./entry-form";

// Words for this screen in both languages (it is used every day at the counter).
const LABELS: Record<"en" | "hi", EntryLabels & { title: string; intro: string; recent: string; none: string; when: string; what: string; lines: string }> = {
  en: {
    title: "Quick Stock In / Out", intro: "For goods that leave or come back without a receipt or a bill here: sold in Zoho, samples, damage, returns. Stock changes as soon as you save.",
    out: "Stock Out", in: "Stock In", reason: "Why?", scan: "Scan item barcode", scanHint: "Each scan adds one piece. For metre or kg items type the quantity.",
    search: "Or search by code or name", searchHint: "Type at least 2 letters", add: "Add", noItems: "No items yet. Scan or search above.",
    reference: "Reference (optional)", referenceHint: "For example Zoho bill number", remarks: "Remarks", save: "Save entry", saving: "Saving...", saved: "Saved",
    remove: "Remove", quantity: "Enter a quantity for", confirmOut: "Take these items OUT of stock now?", confirmIn: "Add these items IN to stock now?",
    recent: "Latest entries here", none: "No entries yet.", when: "When", what: "What", lines: "items",
  },
  hi: {
    title: "जल्दी स्टॉक इन / आउट", intro: "उस माल के लिए जो बिना रसीद या बिल के जाता या लौटता है: Zoho में बिका, सैंपल, ख़राब, वापसी। सेव करते ही स्टॉक बदल जाता है।",
    out: "स्टॉक आउट", in: "स्टॉक इन", reason: "क्यों?", scan: "आइटम का बारकोड स्कैन करें", scanHint: "हर स्कैन 1 पीस जोड़ता है। मीटर या किलो वाले आइटम की मात्रा लिखें।",
    search: "या कोड या नाम से खोजें", searchHint: "कम से कम 2 अक्षर लिखें", add: "जोड़ें", noItems: "अभी कोई आइटम नहीं। ऊपर स्कैन करें या खोजें।",
    reference: "रेफ़रेंस (ज़रूरी नहीं)", referenceHint: "जैसे Zoho बिल नंबर", remarks: "टिप्पणी", save: "सेव करें", saving: "सेव हो रहा है...", saved: "सेव हुआ",
    remove: "हटाएँ", quantity: "मात्रा लिखें", confirmOut: "ये आइटम अभी स्टॉक से बाहर करें?", confirmIn: "ये आइटम अभी स्टॉक में जोड़ें?",
    recent: "यहाँ की हाल की एंट्री", none: "अभी कोई एंट्री नहीं।", when: "कब", what: "क्या", lines: "आइटम",
  },
};

type Row = { id: string; entry_no: string; direction: string; reason: EntryReason; reference: string | null; created_at: string; stock_entry_lines: { count: number }[] };

export default async function StockEntryPage() {
  const user = await requirePermission("stock.entry");
  const lang = await getLang();
  const t = LABELS[lang];
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_entries")
    .select("id, entry_no, direction, reason, reference, created_at, stock_entry_lines(count)")
    .eq("location_id", loc.id)
    .order("created_at", { ascending: false })
    .limit(15);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <main className="space-y-6">
      <p className="text-sm"><Link href="/stock">Stock</Link> / {t.title}</p>
      <div>
        <h1>{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.intro}</p>
      </div>
      <EntryForm placeName={`${loc.name} (${loc.code})`} reasonLabels={REASON_LABELS[lang]} t={t} />

      <section className="space-y-2">
        <h2 className="text-lg">{t.recent}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th>#</th><th>{t.when}</th><th>{t.what}</th><th>{t.reason}</th><th className="text-right">{t.lines}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <td className="font-mono">{r.entry_no}</td>
                    <td className="whitespace-nowrap text-muted">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                    <td><Badge tone={r.direction === "OUT" ? "red" : "green"}>{r.direction === "OUT" ? t.out : t.in}</Badge></td>
                    <td>{REASON_LABELS[lang][r.reason] ?? r.reason}{r.reference ? <span className="text-muted"> · {r.reference}</span> : null}</td>
                    <td className="text-right">{r.stock_entry_lines?.[0]?.count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
