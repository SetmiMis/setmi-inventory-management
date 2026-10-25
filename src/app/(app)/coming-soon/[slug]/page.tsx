import Link from "next/link";
import { notFound } from "next/navigation";
import { Hammer } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getLang, tr, type MessageKey } from "@/lib/i18n";
import { primaryButton } from "@/lib/ui";

// Parts of the dashboard design that the system does not have yet. Only these fixed names are accepted.
const NAMES: Record<string, MessageKey> = {
  racks: "nm_racks",
  customers: "nm_customers",
  "import-shipments": "nm_import",
  "quality-check": "nm_qc",
  "picking-packing": "nm_picking",
  dispatch: "nm_dispatch",
  returns: "nm_returns",
  "purchase-reports": "nm_rpur",
  "stock-valuation": "nm_rval",
};

export default async function ComingSoonPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const key = NAMES[slug];
  if (!key) notFound();
  const lang = await getLang();
  const name = tr(lang, key);
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-[var(--brand-text)]"><Hammer size={30} aria-hidden /></span>
      <h1 className="!text-2xl !font-bold">{name}</h1>
      <p className="font-semibold">{tr(lang, "soon_title")}</p>
      <p className="text-sm text-muted">{tr(lang, "soon_text").replace("{name}", name)}</p>
      <Link href="/dashboard" className={primaryButton}>{tr(lang, "soon_back")}</Link>
    </main>
  );
}
