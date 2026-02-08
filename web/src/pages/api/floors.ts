import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";

type ApiOk = { ok: true; data: any[] };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or POST" } });
  }

  let supabase;
  try {
    ({ client: supabase } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: "AUTH_INVALID", message: "Missing Bearer token" } });
  }

  if (req.method === "GET") {
    const projectId = (req.query.projectId as string) || "";
    if (!projectId) {
      return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
    }

    const { data: buildings, error: buildingError } = await supabase
      .from("buildings")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (buildingError) {
      return res.status((buildingError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: buildingError.message,
          meta: { code: (buildingError as any).code, details: (buildingError as any).details },
        },
      });
    }

    const buildingIds = (buildings || []).map((b: any) => b.id).filter(Boolean);
    if (buildingIds.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const { data, error } = await supabase
      .from("floors")
      .select("id,building_id,name,level,created_at,updated_at")
      .in("building_id", buildingIds)
      .order("level", { ascending: true });

    if (error) {
      return res.status((error as any).status || 400).json({
        ok: false,
        error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
      });
    }

    return res.status(200).json({ ok: true, data: data ?? [] });
  }

  const { projectId, buildingId: bodyBuildingId, name, level } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "name is required" } });
  }

  if (!projectId && !bodyBuildingId) {
    return res
      .status(400)
      .json({ ok: false, error: { code: "BAD_REQUEST", message: "Provide projectId or buildingId" } });
  }

  let buildingId = bodyBuildingId as string | undefined;
  if (!buildingId) {
    const { data: buildingRows, error: buildingLookupError } = await supabase
      .from("buildings")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (buildingLookupError) {
      return res.status((buildingLookupError as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: buildingLookupError.message,
          meta: { code: (buildingLookupError as any).code, details: (buildingLookupError as any).details },
        },
      });
    }

    const building = buildingRows?.[0];
    if (!building) {
      return res
        .status(400)
        .json({ ok: false, error: { code: "BAD_REQUEST", message: "Project has no buildings to attach floors to" } });
    }
    buildingId = building.id;
  }

  async function resolveLevelValue(): Promise<number> {
    if (level === undefined || level === null || String(level).trim() === "") {
      const { data: latestLevel, error: latestError } = await supabase
        .from("floors")
        .select("level")
        .eq("building_id", buildingId)
        .order("level", { ascending: false })
        .limit(1);

      if (latestError) {
        throw latestError;
      }

      const baseLevel = latestLevel?.[0]?.level ?? -1;
      const normalizedBase = Number.isFinite(baseLevel) ? baseLevel : -1;
      return normalizedBase + 1;
    }

    const levelNumber = Number(level);
    if (!Number.isFinite(levelNumber)) {
      throw Object.assign(new Error("Invalid level"), { status: 400, code: "BAD_REQUEST" });
    }
    return Math.floor(levelNumber);
  }

  let levelValue: number;
  try {
    levelValue = await resolveLevelValue();
  } catch (levelErr: any) {
    const status = levelErr?.status || (levelErr?.code === "BAD_REQUEST" ? 400 : 400);
    const message = levelErr?.message || "Unable to determine level";
    return res.status(status).json({ ok: false, error: { code: levelErr?.code || "LEVEL", message } });
  }

  const { data, error } = await supabase
    .from("floors")
    .insert({
      building_id: buildingId,
      name,
      level: levelValue,
    })
    .select("id,name,level")
    .single();

  if (error) {
    const pgCode = (error as any).code;
    if (pgCode === "23505") {
      const { data: existing } = await supabase
        .from("floors")
        .select("id,name,level")
        .eq("building_id", buildingId)
        .eq("level", levelValue)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ ok: true, data: existing });
      }
    }

    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data });
}
