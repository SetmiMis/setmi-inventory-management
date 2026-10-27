import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import { createUserClient } from "../config/supabase.js";

export type CurrentUser = { id: string; email: string; fullName: string | null; isActive: boolean; isAdmin: boolean; permissions: string[] };

// What the other files read from a checked request.
export type AuthedLocals = { user: CurrentUser; db: SupabaseClient };

export function authed(res: Response): AuthedLocals {
  return res.locals as AuthedLocals;
}

export function can(user: CurrentUser, key: string): boolean {
  return user.isActive && (user.isAdmin || user.permissions.includes(key));
}

// Who is calling? The Authorization header must carry the person's Supabase access token. The Auth server is asked
// (getUser), not only the signature, so a revoked session is refused. Deny by default: HTTP 401 / 403 as JSON,
// never a redirect (this is an API, not a page).
export function requireAuth(env: Env): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      if (!header.startsWith("Bearer ")) return void res.status(401).json({ error: "Sign in first." });
      const token = header.slice(7).trim();
      if (token.length < 20 || token.length > 4096) return void res.status(401).json({ error: "Sign in first." });

      const db = createUserClient(env, token);
      const { data: auth, error: authError } = await db.auth.getUser(token);
      if (authError || !auth.user) return void res.status(401).json({ error: "Your session has ended. Sign in again." });

      // Independent reads: ask together.
      const [{ data: profile }, { data: perms }] = await Promise.all([
        db.from("profiles").select("email, full_name, is_active, is_admin").eq("id", auth.user.id).maybeSingle(),
        db.from("user_permissions").select("permission_key").eq("user_id", auth.user.id),
      ]);
      if (!profile) return void res.status(403).json({ error: "Your profile was not found. Ask an administrator." });
      if (!profile.is_active) return void res.status(403).json({ error: "Your account is switched off. Ask an administrator." });

      const user: CurrentUser = {
        id: auth.user.id,
        email: profile.email,
        fullName: profile.full_name,
        isActive: profile.is_active,
        isAdmin: profile.is_admin,
        permissions: (perms ?? []).map((p) => p.permission_key as string),
      };
      res.locals.user = user;
      res.locals.db = db;
      next();
    } catch {
      res.status(500).json({ error: "Could not check your sign-in. Try again." });
    }
  };
}

// One right needed. The database functions and policies check it again: this is the first gate, not the only one.
export function requirePermission(key: string): RequestHandler {
  return (_req, res, next) => {
    if (can(authed(res).user, key)) return next();
    res.status(403).json({ error: "You do not have permission to do this." });
  };
}

export function requireAnyPermission(...keys: string[]): RequestHandler {
  return (_req, res, next) => {
    const u = authed(res).user;
    if (keys.some((k) => can(u, k))) return next();
    res.status(403).json({ error: "You do not have permission to do this." });
  };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const u = authed(res).user;
  if (u.isActive && u.isAdmin) return next();
  res.status(403).json({ error: "Only an administrator can do this." });
};
