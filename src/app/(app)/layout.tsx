import { Suspense } from "react";
import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { logout } from "./actions";

// Every page in this group needs a signed-in user. Reading the session is a request-time
// read, so with Cache Components it must sit inside <Suspense>.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-neutral-500">Loading...</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <header className="mb-6 print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="font-semibold">
            SETMI INDIA IMS
          </Link>
          {can(user, "items.view") && (
            <Link href="/items" className="text-blue-700 underline">
              Items
            </Link>
          )}
          {user.isActive && user.isAdmin && (
            <Link href="/admin/users" className="text-blue-700 underline">
              Users
            </Link>
          )}
        </nav>
        <form action={logout} className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">{user.email}</span>
          <button type="submit" className="rounded border border-neutral-400 px-3 py-1">
            Sign out
          </button>
        </form>
      </header>

      {/* Central guard: an inactive account never reaches any page content. */}
      {user.isActive ? (
        children
      ) : (
        <p role="status" className="rounded border border-amber-500 p-4">
          Your account is created but not active yet. Please ask an administrator to activate it.
        </p>
      )}
    </div>
  );
}
