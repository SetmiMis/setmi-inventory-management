import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { LocationForm } from "../location-form";

export default async function NewLocationPage() {
  await requirePermission("locations.manage");
  return (
    <main className="space-y-4">
      <p className="text-sm">
        <Link href="/locations" className="text-blue-700 underline">Locations</Link> / New
      </p>
      <h1 className="text-xl font-semibold">New warehouse or shop</h1>
      <LocationForm />
    </main>
  );
}

export const metadata = { title: "Add Location" };
