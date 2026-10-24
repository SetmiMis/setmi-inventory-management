import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "../item-form";

export default async function NewItemPage() {
  await requirePermission("items.create");
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");

  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href="/items" className="text-blue-700 underline">Items</Link> / New
      </p>
      <h1 className="text-xl font-semibold">New item</h1>
      <ItemForm categories={categories ?? []} canEditSellingName />
    </main>
  );
}
