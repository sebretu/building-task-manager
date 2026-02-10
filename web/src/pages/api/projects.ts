import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, createServiceSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { isAdminRole, requireRequesterProfile } from "@/lib/requesterProfile";

type ApiOk<T = any> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
      // DEBUG: Log incoming request and user info
      if (req.method === "GET") {
        console.log("[API/projects] GET called");
      }
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    if (req.method === "GET") {
      // Get user profile to check role
      let requester = null;
      try {
        const { userId } = await createServerSupabaseClient(req);
        requester = await requireRequesterProfile(client, userId);
      } catch (e) {
        // fallback: no profile, treat as non-admin
      }

      let query = client
        .from("projects")
        .select("id,name,address,is_archived,created_at,updated_at")
        .eq("is_archived", false);

      // DEBUG: Log requester info
      console.log("[API/projects] requester:", requester);

      // If not admin, filter by company_id
      if (!requester || !isAdminRole(requester.role)) {
        if (requester?.company_id) {
          query = query.eq("company_id", requester.company_id);
        } else {
          // No company, return empty
          return res.status(200).json({ ok: true, data: [] });
        }
      }

      const { data, error } = await query.order("created_at", { ascending: true });

  // DEBUG: Log number of projects returned
  console.log("[API/projects] projects count:", data?.length, data?.map(p => p.name));

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

    // PATCH: update project name (and optionally company_id)
    if (req.method === "PATCH") {
      const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
      const newName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const newCompanyId = typeof req.body?.company_id === "string" ? req.body.company_id.trim() : undefined;
      if (!id || !isUuid(id)) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Project id is required for update" },
        });
      }
      if (!newName) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "Project name is required" },
        });
      }
      const updateObj: any = { name: newName };
      if (newCompanyId && isUuid(newCompanyId)) updateObj.company_id = newCompanyId;
      const { data, error } = await serviceClient
        .from("projects")
        .update(updateObj)
        .eq("id", id)
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
