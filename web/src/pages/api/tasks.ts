import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type ApiOk = { ok: true; data: any[]; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET" } });
  }

  const projectId = String(req.query.projectId || "").trim();
  if (!projectId) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
  }

  const limit = Math.min(Math.max(asInt(req.query.limit, 50) || 50, 1), 200);
  const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  const supabase = createClient(url, service || anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // UWAGA: wybierz kolumny jeśli chcesz. Na start * żeby UI na pewno dostało dane.
  let query = supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .range(offset, offset + limit - 1)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  // jeśli twoje pola nazywają się inaczej niż title/description, dopasuj to OR
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

  const { data, error } = await query;

  if (error) {
    return res.status((error as any).status || 400).json({
      ok: false,
      error: { code: "SUPABASE", message: error.message, meta: { code: (error as any).code, details: (error as any).details } },
    });
  }

  return res.status(200).json({ ok: true, data: data ?? [], meta: { limit, offset } });
}
