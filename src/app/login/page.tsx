import { Warehouse } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--sidebar)] via-[#06405e] to-[#0a6a9a] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white shadow">
            <Warehouse size={24} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold leading-tight">SETMI INDIA</h1>
            <p className="text-sm text-muted">Inventory Management System</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
