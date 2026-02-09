import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { isAdminRole, requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    if (req.method === "GET") {
      const { data, error } = await client
        .from("projects")
        .select("id,name,address,is_archived,created_at,updated_at")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

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

    const requester = await requireRequesterProfile(client, userId);
    if (!isAdminRole(requester.role)) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only admins can modify projects" },
      });
    }

    const serviceClient = createServiceSupabaseClient();

    if (req.method === "POST") {
      const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!rawName) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Project name is required" },
        });
      }

      const requestedCompanyId = typeof req.body?.company_id === "string" ? req.body.company_id.trim() : "";
      if (requestedCompanyId && !isUuid(requestedCompanyId)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid company id" },
        });
      }

      const companyIdToUse = requestedCompanyId || requester.company_id || "";
      if (!companyIdToUse) {
        return res.status(400).json({
          ok: false,
          error: { code: "MISSING_COMPANY", message: "Assign a company before creating a project" },
        });
      }

      const { data, error } = await serviceClient
        .from("projects")
        .insert({ name: rawName, company_id: companyIdToUse, is_archived: false })
        .select("id,name,address,is_archived,created_at,updated_at")
        .single();

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

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const projectId = typeof req.query.id === "string" ? req.query.id.trim() : "";
      if (!projectId || !isUuid(projectId)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Invalid project id" },
        });
      }

      const { data, error } = await serviceClient
        .from("projects")
        .update({ is_archived: true })
        .eq("id", projectId)
        .select("id,name,address,is_archived,created_at,updated_at")
        .single();

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

      return res.status(200).json({ ok: true, data });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Missing Bearer token" },
      });
    }

    console.error("Error in /api/projects", err);
    return res.status(500).json({
      ok: false,
      error: {
        code: "SERVER_ERROR",
        message: err instanceof Error ? err.message : "Internal server error",
      },
    });
  }
}
