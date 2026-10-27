import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { Env } from "./config/env.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import { itemsRouter } from "./modules/items/items.routes.js";

export function createApp(env: Env) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind Nginx / the host's proxy: the real caller address is in X-Forwarded-For

  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, methods: ["GET", "POST", "PATCH", "DELETE"], allowedHeaders: ["Content-Type", "Authorization"] }));
  app.use(express.json({ limit: "4mb" }));

  app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a little and try again." },
  }));

  // For the host's monitoring. Tells nothing about the system.
  app.get("/health", (_req, res) => void res.json({ status: "ok" }));

  const auth = requireAuth(env);
  app.use("/api/items", itemsRouter(auth));

  app.use("/api", (_req, res) => void res.status(404).json({ error: "Not found." }));

  // Last stop: never send internal error text to the caller.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err && typeof err === "object" && "type" in err && err.type === "entity.parse.failed") return void res.status(400).json({ error: "The request body is not valid JSON." });
    if (err && typeof err === "object" && "type" in err && err.type === "entity.too.large") return void res.status(413).json({ error: "The request is too large." });
    console.error("[api] unexpected error:", err instanceof Error ? err.message : "unknown");
    res.status(500).json({ error: "Something went wrong. Please try again." });
  };
  app.use(onError);
  return app;
}
