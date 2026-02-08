import { createServerSupabaseClient, isAuthRequiredError } from "@/lib/supabaseServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { NextApiRequest, NextApiResponse } from "next";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { message: string; code?: string; meta?: any } };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function confirmUserEmail(adminClient: ReturnType<typeof getSupabaseAdminClient>, userId: string) {
  await adminClient.auth.admin
    .updateUserById(userId, {
      email_confirm: true,
    })
    .catch((e) => {
      console.error("Failed to confirm auth email", e?.message || e);
    });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiOk<any> | ApiErr>
) {
  try {
    const { client, userId } = await createServerSupabaseClient(req);

    if (req.method === "GET") {
      const { data, error } = await client
        .from("profiles")
        .select("id, full_name, email, role, company_id, is_active, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
      }

      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === "POST") {
      const { email, full_name, company_id, role, password, project_id, project_role } = req.body || {};

      if (!email || !full_name) {
        return res.status(400).json({ ok: false, error: { message: "Email and full_name are required", code: "BAD_REQUEST" } });
      }

      const trimmedPassword = typeof password === "string" ? password.trim() : "";
      if (!trimmedPassword || trimmedPassword.length < 8) {
        return res.status(400).json({ ok: false, error: { message: "Password must be at least 8 characters", code: "BAD_REQUEST" } });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status(requesterError.status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can invite users", code: "FORBIDDEN" } });
      }

      const trimmedProjectId = typeof project_id === "string" ? project_id.trim() : "";
      const shouldAttachProject = trimmedProjectId.length > 0;
      if (shouldAttachProject && !isUuid(trimmedProjectId)) {
        return res.status(400).json({ ok: false, error: { message: "Invalid project_id", code: "BAD_REQUEST" } });
      }

      const normalizedProjectRole = typeof project_role === "string" && project_role.trim().length > 0
        ? project_role.trim().toUpperCase()
        : "USER";
      const allowedProjectRoles = new Set(["ADMIN", "MODERATOR", "USER"]);
      const projectRoleToUse = allowedProjectRoles.has(normalizedProjectRole) ? normalizedProjectRole : "USER";

      const adminClient = getSupabaseAdminClient();

      let authUserId: string | null = null;
      const createRes = await adminClient.auth.admin.createUser({
        email,
        password: trimmedPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createRes.error) {
        if (createRes.error.message?.toLowerCase().includes("already registered") || createRes.error.message?.toLowerCase().includes("already exists")) {
          const existing = await adminClient.auth.admin.getUserByEmail(email);
          authUserId = existing.data?.user?.id || null;
          if (!authUserId) {
            return res.status(400).json({ ok: false, error: { message: "User already exists", code: "USER_EXISTS" } });
          }
          await adminClient.auth.admin.updateUserById(authUserId, {
            email_confirm: true,
            user_metadata: { full_name },
            password: trimmedPassword,
          });
        } else {
          return res.status(createRes.error.status || 400).json({
            ok: false,
            error: { message: createRes.error.message, code: createRes.error.status ? String(createRes.error.status) : "AUTH" },
          });
        }
      } else {
        authUserId = createRes.data?.user?.id || null;
      }

      if (!authUserId) {
        return res.status(500).json({ ok: false, error: { message: "Unable to determine auth user id", code: "AUTH_USER" } });
      }

      const { data, error } = await adminClient
        .from("profiles")
        .upsert(
          {
            id: authUserId,
            email,
            full_name,
            role: role || "USER",
            company_id: company_id || null,
            is_active: true,
          },
          { onConflict: "id" }
        )
        .select("id, full_name, email, role, company_id, is_active, created_at")
        .single();

      if (error) {
        return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
      }

      if (shouldAttachProject) {
        const { error: memberError } = await adminClient
          .from("project_members")
          .upsert(
            {
              project_id: trimmedProjectId,
              user_id: authUserId,
              role: projectRoleToUse,
              added_by: userId,
            },
            { onConflict: "project_id,user_id" }
          )
          .select("id")
          .single();

        if (memberError) {
          return res.status(400).json({ ok: false, error: { message: memberError.message, code: memberError.code, meta: memberError.details } });
        }
      }

      await confirmUserEmail(adminClient, authUserId);

      return res.status(201).json({ ok: true, data });
    }

    if (req.method === "PATCH") {
      const { id, full_name, role, company_id, is_active, password, confirm_email } = req.body || {};

      if (!id) {
        return res.status(400).json({ ok: false, error: { message: "Missing user id", code: "BAD_REQUEST" } });
      }

      const trimmedPassword = typeof password === "string" ? password.trim() : "";
      if (trimmedPassword && trimmedPassword.length < 8) {
        return res.status(400).json({ ok: false, error: { message: "Password must be at least 8 characters", code: "BAD_REQUEST" } });
      }

      if (!userId) {
        return res.status(401).json({ ok: false, error: { message: "Missing auth user", code: "AUTH_INVALID" } });
      }

      const { data: requester, error: requesterError } = await client
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

      if (requesterError) {
        return res.status(requesterError.status || 400).json({
          ok: false,
          error: { message: requesterError.message, code: requesterError.code, meta: requesterError.details },
        });
      }

      if (requester?.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: { message: "Only admins can edit users", code: "FORBIDDEN" } });
      }

      const adminClient = getSupabaseAdminClient();
      const patch: Record<string, any> = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (role !== undefined) patch.role = role;
      if (company_id !== undefined) patch.company_id = company_id || null;
      if (is_active !== undefined) patch.is_active = !!is_active;

      const shouldConfirmEmail =
        confirm_email === undefined ? Boolean(trimmedPassword) : Boolean(confirm_email);

      if (Object.keys(patch).length === 0 && !trimmedPassword && !shouldConfirmEmail) {
        return res.status(400).json({ ok: false, error: { message: "No changes provided", code: "BAD_REQUEST" } });
      }

      let profileData;
      if (Object.keys(patch).length > 0) {
        const { data, error } = await adminClient
          .from("profiles")
          .update(patch)
          .eq("id", id)
          .select("id, full_name, email, role, company_id, is_active, created_at")
          .single();

        if (error) {
          return res.status(400).json({ ok: false, error: { message: error.message, code: error.code, meta: error.details } });
        }
        profileData = data;
      } else {
        const { data } = await adminClient
          .from("profiles")
          .select("id, full_name, email, role, company_id, is_active, created_at")
          .eq("id", id)
          .single();
        profileData = data;
      }

      const authUpdate: { user_metadata?: Record<string, any>; password?: string } = {};
      if (full_name !== undefined) {
        authUpdate.user_metadata = { full_name };
      }
      if (trimmedPassword) {
        authUpdate.password = trimmedPassword;
      }

      if (authUpdate.user_metadata || authUpdate.password) {
        await adminClient.auth.admin.updateUserById(id, authUpdate).catch((error) => {
          console.error("Failed to update auth user", error?.message || error);
        });
      }

      if (shouldConfirmEmail) {
        await confirmUserEmail(adminClient, id);
      }

      return res.status(200).json({ ok: true, data: profileData });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ ok: false, error: { message: "Method not allowed", code: "METHOD_NOT_ALLOWED" } });
  } catch (err) {
    if (isAuthRequiredError(err)) {
      return res.status(401).json({
        ok: false,
        error: { message: "Missing Bearer token", code: "AUTH_REQUIRED" },
      });
    }

    console.error("Error in /api/users:", err);
    return res.status(500).json({
      ok: false,
      error: {
        message: err instanceof Error ? err.message : "Internal server error",
        code: "SERVER_ERROR",
      },
    });
  }
}
