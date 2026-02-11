import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
  }

  let supabase;
  let userId: string | null = null;
  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  let requester;
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: { code: err?.code || "PROFILE_ERROR", message: err?.message || "Unable to load profile" },
    });
  }

  if (!isAdminRole(requester.role)) {
    return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only admins can add buildings" } });
  }

  const { project_id, name } = req.body ?? {};
  if (!project_id || typeof project_id !== "string" || !name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id or name" } });
  }

  const adminSupabase = createServiceSupabaseClient();
  const { data, error } = await adminSupabase
    .from("buildings")
    .insert([{ project_id, name: name.trim() }])
    .select("id, project_id, name, created_at, updated_at")
    .single();

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data });
}
