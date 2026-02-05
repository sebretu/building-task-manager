import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any[] };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

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

  const projectId = (req.query.projectId as string) || "";
  if (!projectId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
  }

  const { data, error } = await supabase
    .from("floors")
    .select("id,building_id,name,level,created_at,updated_at")
    .eq("building_id", projectId)
    .order("level", { ascending: true });

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}
