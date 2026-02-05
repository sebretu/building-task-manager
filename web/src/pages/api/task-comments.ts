import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, getUserIdFromRequest } from "@/lib/supabaseServer";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function readJsonBody(req: NextApiRequest): any {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

function bad(res: NextApiResponse<ApiOk | ApiErr>, message: string, meta?: any) {
  return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message, meta } });
}

function supaErr(res: NextApiResponse<ApiOk | ApiErr>, error: any) {
  return res.status(error?.status || 400).json({
    ok: false,
    error: {
      code: "SUPABASE",
      message: error?.message || "supabase error",
      meta: { code: error?.code, details: error?.details },
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  // GET /api/task-comments?taskId=...
  if (req.method === "GET") {
    const taskId = String(req.query.taskId || "").trim();
    if (!taskId) return bad(res, "Missing query: taskId");

    const { data, error } = await (supabase as any)
      .from("task_comments")
      .select("id, task_id, user_id, comment, created_at")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error) return supaErr(res, error);
    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  // POST /api/task-comments
  // body: { task_id, comment }
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const task_id = String(body?.task_id || "").trim();
    const comment = String(body?.comment || "").trim();

    if (!task_id) return bad(res, "Missing task_id");
    if (!userId) return bad(res, "Cannot determine user from token");
    if (!comment) return bad(res, "Missing comment");

    const ins = await (supabase as any)
      .from("task_comments")
      .insert({
        task_id,
        user_id: userId,
        comment,
      } as any)
      .select("*")
      .single();

    if (ins.error) return supaErr(res, ins.error);

    return res.status(200).json({ ok: true, data: ins.data });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
}
