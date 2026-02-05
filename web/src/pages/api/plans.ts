import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any[] };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function getBearer(req: NextApiRequest) {
  const auth = (req.headers.authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let q = supabase
    .from("plans")
    .select("id,project_id,floor_id,version,status,pdf_path,image_path,image_width,image_height,is_current,storage_bucket,storage_path,processing_error,created_at,updated_at")
    .eq("project_id", projectId);

  if (floorId) q = q.eq("floor_id", floorId);
  if (onlyCurrent) q = q.eq("is_current", true);

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}
