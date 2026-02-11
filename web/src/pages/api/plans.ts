import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";

type ApiOk = { ok: true; data: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function getBearer(req: NextApiRequest) {
  const auth = (req.headers.authorization || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or DELETE" } });
  }

  let supabase: any;
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

  if (req.method === "DELETE") {
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can delete plans" },
      });
    }
    return handleDelete(req, res);
  }

  const projectId = (req.query.projectId as string) || "";
  if (!projectId) return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });

  const floorId = (req.query.floorId as string) || undefined;
  const onlyCurrent = ((req.query.current as string) || "").toLowerCase() === "true";

  let q = supabase
    .from("plans")
    .select("id,project_id,floor_id,version,status,pdf_path,image_path,image_width,image_height,is_current,storage_bucket,storage_path,processing_error,created_at,updated_at")
    .eq("project_id", projectId);

  if (floorId) q = q.eq("floor_id", floorId);
  if (onlyCurrent) q = q.eq("is_current", true);

  if (!isAdmin) {
    const { data: userPlans, error: userPlansError } = await supabase
      .from("tasks")
      .select("plan_id")
      .eq("project_id", projectId)
      .eq("assigned_user_id", requester.id)
      .not("plan_id", "is", null);

    if (userPlansError) {
      return res.status((userPlansError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: userPlansError.message,
          meta: { code: (userPlansError as any).code, details: (userPlansError as any).details },
        },
      });
    }

    const planIds = Array.from(new Set((userPlans || []).map((t: any) => t.plan_id).filter(Boolean))) as string[];
    if (planIds.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    q = q.in("id", planIds);
  }

  const { data, error } = await q.order("created_at", { ascending: false });

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [] });
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  const planId = (req.query.id as string) || (req.body && (req.body as any).id) || "";
  if (!planId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing plan id" } });
  }

  let admin: ReturnType<typeof getSupabaseAdminClient>;
  try {
    admin = getSupabaseAdminClient();
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: { code: "CONFIG", message: e?.message || "Admin client error" } });
  }

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id,project_id,floor_id,storage_bucket,storage_path")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    return res.status((planError as any).status || 400).json({
      ok: false,
      error: {
        code: "SUPABASE",
        message: planError.message,
        meta: { code: (planError as any).code, details: (planError as any).details },
      },
    });
  }

  if (!plan) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Plan not found" } });
  }

  const { error: deleteTasksError } = await admin.from("tasks").delete().eq("plan_id", planId);
  if (deleteTasksError) {
    const err = deleteTasksError as any;
    return res.status(err?.status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: deleteTasksError.message, meta: { code: err?.code, details: err?.details } },
    });
  }

  const deleteResult = await admin.from("plans").delete().eq("id", planId);
  if (deleteResult.error) {
    const err = deleteResult.error as any;
    return res.status(err?.status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: deleteResult.error.message, meta: { code: err?.code, details: err?.details } },
    });
  }

  if (plan.storage_bucket && plan.storage_path) {
    await admin.storage.from(plan.storage_bucket).remove([plan.storage_path]).catch(() => { });
  }

  const tilesDir = path.join(process.cwd(), "public", "tiles", planId);
  await fs.rm(tilesDir, { recursive: true, force: true }).catch(() => { });

  const { data: replacement, error: replacementError } = await admin
    .from("plans")
    .select("id")
    .eq("project_id", plan.project_id)
    .eq("floor_id", plan.floor_id)
    .order("version", { ascending: false })
    .limit(1);

  if (!replacementError && replacement?.[0]) {
    await admin.from("plans").update({ is_current: true }).eq("id", replacement[0].id);
  }

  return res.status(200).json({ ok: true, data: { id: planId } });
}
