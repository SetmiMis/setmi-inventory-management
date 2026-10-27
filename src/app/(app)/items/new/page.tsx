import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddProductForm } from "./add-product-form";

// Master Data > Product / SKU > Add Product.
export default async function NewItemPage() {
  const user = await requirePermission("items.create");
  const supabase = await createClient();
  const [{ data: categories }, { data: units }, { data: brands }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("units").select("code, name").eq("is_active", true).order("code"),
    supabase.from("items").select("brand").not("brand", "is", null).order("brand").limit(500),
  ]);
  const brandList = [...new Set((brands ?? []).map((b) => b.brand as string))];

  return (
    <AddProductForm
      categories={categories ?? []}
      units={units ?? []}
      brands={brandList}
      canEditPrice={can(user, "items.edit_price")}
      canUploadImages={can(user, "items.edit")}
    />
  );
}
