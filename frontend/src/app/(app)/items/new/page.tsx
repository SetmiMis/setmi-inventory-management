import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AddProductForm } from "./add-product-form";

// Master Data > Product / SKU > Add Product.
export default async function NewItemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("items.create");
  const supabase = await createClient();
  const [{ data: categories }, { data: units }, { data: brands }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("units").select("code, name").eq("is_active", true).order("code"),
    supabase.from("items").select("brand").not("brand", "is", null).order("brand").limit(500),
  ]);
  const brandList = [...new Set((brands ?? []).map((b) => b.brand as string))];

  // "Duplicate": ?from=<product id> fills the form with that product's details. Code, barcodes and pictures are NOT copied.
  const fromParam = (await searchParams).from;
  const from = z.uuid().safeParse(Array.isArray(fromParam) ? fromParam[0] : fromParam).data;
  const { data: src } = from ? await supabase.from("items").select("*").eq("id", from).maybeSingle() : { data: null };
  const initial = src
    ? {
        fromCode: src.internal_item_code as string,
        values: {
          itemName: src.item_name, sellingItemName: src.selling_item_name, categoryId: src.category_id, unit: src.unit, purchaseSource: src.purchase_source,
          brand: src.brand, subCategory: src.sub_category, hsnCode: src.hsn_code, shortDescription: src.short_description, detailedDescription: src.detailed_description,
          productType: src.product_type, material: src.material, color: src.color, netWeight: src.net_weight, weightUnit: src.weight_unit,
          dimL: src.dim_l, dimW: src.dim_w, dimH: src.dim_h, dimUnit: src.dim_unit, countryOfOrigin: src.country_of_origin, modelNo: src.model_no,
          searchKeywords: src.search_keywords, shelfLife: src.shelf_life, remarks: src.remarks, moq: src.moq, leadTimeDays: src.lead_time_days,
          safetyFactor: src.safety_factor, sellingPrice: src.selling_price, importItemCode: "",
        } as Record<string, string | number | null>,
        tags: (src.tags ?? []) as string[],
        flags: { isActive: src.is_active, showInSales: src.show_in_sales, showInPurchase: src.show_in_purchase, lowStockAlert: src.low_stock_alert },
      }
    : null;

  return (
    <AddProductForm
      categories={categories ?? []}
      units={units ?? []}
      brands={brandList}
      canEditPrice={can(user, "items.edit_price")}
      canUploadImages={can(user, "items.edit")}
      initial={initial}
    />
  );
}

export const metadata = { title: "Add Product" };
