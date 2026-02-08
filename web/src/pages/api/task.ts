import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  const isAdmin = isAdminRole(requester.role);

  const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
  if (!id || !isUuid(id)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" } });
  }

  // GET /api/task?id=...
  if (req.method === "GET") {
    const { data, error } = await supabase.from("tasks").select("*").eq("id", id).single();
    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    if (!isAdmin && data?.assigned_user_id !== requester.id) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "You do not have access to this task" },
      });
    }
    return res.status(200).json({ ok: true, data });
  }

  // DELETE /api/task?id=...
  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can delete tasks" },
      });
    }

    // bezpieczeństwo: jeśli nie ma service key, to nie kasujemy
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
    if (!service) {
      return res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "DELETE requires SUPABASE_SERVICE_ROLE_KEY" },
      });
    }

    const del = await supabase.from("tasks").delete().eq("id", id).select("id").single();
    if (del.error) {
      return res.status((del.error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: del.error.message, meta: { code: (del.error as any).code, details: (del.error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: del.data });
  }

  res.setHeader("Allow", "GET, DELETE");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE" } });
}
