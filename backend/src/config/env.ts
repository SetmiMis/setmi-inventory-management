import { z } from "zod";

// Every setting the backend needs, checked once at start. Missing or wrong values stop the server with a clear message.
// There is deliberately NO service-role key: the backend acts as the signed-in person (their token), so the database
// Row Level Security rules and the permission checks inside the database functions apply to every request.
const schema = z.object({
  SUPABASE_URL: z.url("SUPABASE_URL must be the project address, for example https://xxxx.supabase.co"),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "SUPABASE_PUBLISHABLE_KEY is missing"),
  FRONTEND_URL: z.url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Backend settings are not valid (see backend/.env.example):\n${lines}`);
  }
  return parsed.data;
}
