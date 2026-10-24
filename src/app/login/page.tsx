import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">SETMI INDIA</h1>
      <p className="mb-6 text-sm text-neutral-500">Inventory Management System</p>
      <LoginForm />
    </main>
  );
}
