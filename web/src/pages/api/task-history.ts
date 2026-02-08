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

  async function ensureTaskAccess(taskId: string) {
    if (isAdmin) return;
    const { data, error } = await supabase
      .from("tasks")
      .select("assigned_user_id")
      .eq("id", taskId)
      .single();

    if (error) {
      throw {
        status: (error as any).status || 400,
        code: (error as any).code || "SUPABASE",
        message: error.message,
        meta: { code: (error as any).code, details: (error as any).details },
      };
    }

    if (data?.assigned_user_id !== requester.id) {
      throw { status: 403, code: "FORBIDDEN", message: "You do not have access to this task" };
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  const taskId = typeof req.query.taskId === "string" ? req.query.taskId.trim() : "";
  if (!taskId || !isUuid(taskId)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid taskId (uuid)" } });
  }

  try {
    await ensureTaskAccess(taskId);
  } catch (err: any) {
    const status = err?.status || 400;
    return res.status(status).json({ ok: false, error: { code: err?.code || "FORBIDDEN", message: err?.message || "Access denied", meta: err?.meta } });
  }

  const { data, error } = await supabase
    .from("task_history")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: {
        code: "SUPABASE",
        message: error.message,
        meta: { code: (error as any).code, details: (error as any).details },
      },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}
