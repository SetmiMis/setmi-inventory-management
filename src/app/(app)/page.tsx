import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Welcome{user.fullName ? `, ${user.fullName}` : ""}</h1>
      <p className="text-sm text-neutral-500">
        Item Master, warehouses, shops and billing modules will appear here as they are built.
      </p>
      <section>
        <h2 className="mb-1 text-sm font-medium">Your access</h2>
        {user.isAdmin ? (
          <p className="text-sm">Administrator: all permissions.</p>
        ) : user.permissions.length === 0 ? (
          <p className="text-sm">No permissions have been given to you yet.</p>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {user.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
