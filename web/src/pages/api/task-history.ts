import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  const taskId = typeof req.query.taskId === "string" ? req.query.taskId.trim() : "";
  if (!taskId || !isUuid(taskId)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing/invalid taskId (uuid)" } });
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
