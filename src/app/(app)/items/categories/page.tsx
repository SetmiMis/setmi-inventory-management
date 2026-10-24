import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoryForm } from "./category-form";

export default async function CategoriesPage() {
  await requirePermission("categories.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name, is_active").order("name");

  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href="/items" className="text-blue-700 underline">
          Items
        </Link>{" "}
        / Categories
      </p>
      <h1 className="text-xl font-semibold">Item categories</h1>
      <p className="text-sm text-neutral-500">
        Items pick a category from this list, so the same category is never spelled two ways.
        Switch a category off to hide it from new items; old items keep it.
      </p>

      <section className="rounded border border-neutral-300 p-3">
        <CategoryForm />
      </section>

      {error ? (
        <p role="alert" className="text-red-600">Could not load categories.</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm">No categories yet.</p>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((c) => (
            <li key={c.id} className="rounded border border-neutral-300 p-3">
              <CategoryForm category={{ id: c.id, name: c.name, isActive: c.is_active }} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
