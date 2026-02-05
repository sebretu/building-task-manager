import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest } from "next";

/**
 * Extract Bearer token from Authorization header
 */
export function getBearerToken(req: NextApiRequest | Request): string | null {
  const auth =
    req instanceof Request
      ? req.headers.get("authorization") || ""
      : (req.headers.authorization || "");

  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/**
 * Extract JWT from Authorization header
 */
export function getAuthToken(req: NextApiRequest | Request): string | null {
  return getBearerToken(req);
}

/**
 * Create authenticated Supabase client:
 * - Uses Bearer token from Authorization header (user session)
 * - Falls back to service role only in DEV mode
 * - For FAZA B: remove fallback, make token required always
 */
export function createServerSupabaseClient(
  req: NextApiRequest | Request,
  options?: { requireAuth?: boolean }
): { client: any; userId: string | null } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const token = getAuthToken(req);

  // By default require auth. In development, if no token is present
  // allow a temporary fallback using the service role key so local
  // testing is possible. This MUST NOT be used in production.
  if (!token && options?.requireAuth !== false) {
    if (process.env.NODE_ENV !== "production") {
      const service =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (!service) {
        throw new Error("AUTH_REQUIRED");
      }

      const client = createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      // For local testing you can set DEV_SUPABASE_USER_ID to an existing
      // profile id in your DB so server handlers that expect `userId` work.
      // Example: export DEV_SUPABASE_USER_ID="<uuid>"
      const devUserId = process.env.DEV_SUPABASE_USER_ID || null;
      return { client, userId: devUserId };
    }

    throw new Error("AUTH_REQUIRED");
  }

  const client = createClient(url, anonKey, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Decode userId from JWT if present
  let userId: string | null = null;
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
        userId = decoded.sub || null;
      }
    } catch {
      // Nie udało się decode, userId pozostaje null
    }
  }

  return { client, userId };
}

/**
 * Helper: get userId from request
 */
export function getUserIdFromRequest(req: NextApiRequest | Request): string | null {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
      return decoded.sub || null;
    }
  } catch {
    return null;
  }

  return null;
}
