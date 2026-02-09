import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { requireRequesterProfile, isAdminRole } from "@/lib/requesterProfile";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

type ApiOk = { ok: true; data: any; meta?: any };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type NotificationSettings = {
  notify_on_create: boolean;
  notify_on_status: boolean;
  notify_on_assign: boolean;
};

function asInt(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : def;
}

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notify_on_create: true,
  notify_on_status: true,
  notify_on_assign: true,
};

function getFunctionsBaseUrl() {
  if (process.env.SUPABASE_FUNCTIONS_URL) return process.env.SUPABASE_FUNCTIONS_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  return supabaseUrl ? `${supabaseUrl}/functions/v1` : "";
}

async function sendNotificationEmail(input: { to: string; subject: string; html: string }) {
  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) return;

  const authToken = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!authToken) return;

  await fetch(`${baseUrl}/notify-task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(input),
  });
}

async function loadNotificationSettings(supabase: any, userId: string | null): Promise<NotificationSettings> {
  if (!userId) return DEFAULT_NOTIFICATION_SETTINGS;
  const { data } = await supabase.from("profiles").select("notification_settings").eq("id", userId).single();
  return (data as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;
}

let cachedAdminClient: ReturnType<typeof getSupabaseAdminClient> | null = null;
function getAdminClientSafely() {
  if (cachedAdminClient) return cachedAdminClient;
  try {
    cachedAdminClient = getSupabaseAdminClient();
  } catch (err) {
    console.error("[tasks api] cannot init admin client", err);
    cachedAdminClient = null;
  }
  return cachedAdminClient;
}

async function ensureProjectMembership(projectId: string | null | undefined, userId: string | null | undefined, addedBy: string | null) {
  if (!projectId || !userId) return;
  const admin = getAdminClientSafely();
  if (!admin) return;
  try {
    await admin
      .from("project_members")
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          role: "USER",
          added_by: addedBy,
        },
        { onConflict: "project_id,user_id" }
      )
      .select("id")
      .single();
  } catch (err) {
    console.error("[tasks api] ensureProjectMembership failed", err);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

  let requester: { id: string; role: string | null };
  try {
    requester = await requireRequesterProfile(supabase, userId);
  } catch (err: any) {
    return res.status(err?.status || 403).json({
      ok: false,
      error: {
        code: err?.code || "PROFILE_ERROR",
        message: err?.message || "Unable to load profile",
      },
    });
  }

  const isAdmin = isAdminRole(requester.role);

  // ------------------------
  // GET /api/tasks (list)
  // ------------------------
  if (req.method === "GET") {
    const projectId = String(req.query.projectId || "").trim();
    if (!projectId) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing query: projectId" } });
      return;
    }

    const planId = typeof req.query.planId === "string" ? req.query.planId.trim() : "";
    const limit = Math.min(Math.max(asInt(req.query.limit, 50) || 50, 1), 200);
    const offset = Math.max(asInt(req.query.offset, 0) || 0, 0);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority.trim() : "";
    const assignedUserId = typeof req.query.assigned_user_id === "string" ? req.query.assigned_user_id.trim() : "";
    const dueFrom = typeof req.query.due_from === "string" ? req.query.due_from.trim() : "";
    const dueTo = typeof req.query.due_to === "string" ? req.query.due_to.trim() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort.trim() : "";

    let query = supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (planId) query = query.eq("plan_id", planId);
    if (status) query = query.eq("status", status as any);
    if (priority) query = query.eq("priority", priority as any);
    const effectiveAssignedId = isAdmin ? assignedUserId : requester.id;
    if (effectiveAssignedId) query = query.eq("assigned_user_id", effectiveAssignedId);
    if (dueFrom) query = query.gte("due_date", dueFrom);
    if (dueTo) query = query.lte("due_date", dueTo);
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);

    if (sort === "due_asc") {
      query = query.order("due_date", { ascending: true, nullsFirst: false });
    } else if (sort === "due_desc") {
      query = query.order("due_date", { ascending: false, nullsFirst: false });
    } else if (sort === "priority_desc") {
      query = query.order("priority", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: error.message,
          meta: { code: (error as any).code, details: (error as any).details },
        },
      });
      return;
    }

    res.status(200).json({ ok: true, data: data ?? [], meta: { limit, offset, planId: planId || null } });
    return;
  }

  // ------------------------
  // POST /api/tasks (create)
  // ------------------------
  if (req.method === "POST") {
    const body = readJsonBody(req);

    const project_id = String(body?.project_id || "").trim();
    const plan_id = String(body?.plan_id || "").trim();
    const title = String(body?.title || "").trim();
    const description = body?.description == null ? null : String(body.description);
    const due_date_raw = body?.due_date;
    const due_date = due_date_raw == null ? null : String(due_date_raw).trim() || null;

    const priority = String(body?.priority || "MEDIUM").trim();
    const status = String(body?.status || "OPEN").trim();
    const assigned_raw = typeof body?.assigned_user_id === "string" ? body.assigned_user_id.trim() : "";
    if (assigned_raw && !isUuid(assigned_raw)) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "assigned_user_id must be uuid" } });
      return;
    }

    const x_norm_raw = body?.x_norm;
    const y_norm_raw = body?.y_norm;
    const x_norm = typeof x_norm_raw === "number" ? x_norm_raw : Number(x_norm_raw);
    const y_norm = typeof y_norm_raw === "number" ? y_norm_raw : Number(y_norm_raw);

    if (!project_id) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing project_id" } });
      return;
    }
    if (!plan_id) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing plan_id" } });
      return;
    }
    if (!title) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Missing title" } });
      return;
    }
    if (!Number.isFinite(x_norm) || x_norm < 0 || x_norm > 1) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "x_norm must be number 0..1" } });
      return;
    }
    if (!Number.isFinite(y_norm) || y_norm < 0 || y_norm > 1) {
      res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "y_norm must be number 0..1" } });
      return;
    }

    // created_by = auth.uid() z JWT
    const created_by = userId;
    if (!created_by) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Cannot determine user from token" },
      });
      return;
    }

    const assigned_user_id = isAdmin ? assigned_raw || null : requester.id;
    if (!isAdmin && !assigned_user_id) {
      res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Only authenticated users can create tasks" },
      });
      return;
    }

    const payload: any = {
      project_id,
      plan_id,
      x_norm,
      y_norm,
      title,
      description,
      priority,
      status,
      created_by,
      assigned_user_id,
      due_date,
    };

    const { data, error } = await supabase.from("tasks").insert(payload).select("*").single();

    if (error) {
      res.status((error as any).status || 400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: error.message,
          meta: { code: (error as any).code, details: (error as any).details },
        },
      });
      return;
    }

    if (data?.assigned_user_id) {
      await ensureProjectMembership(project_id, data.assigned_user_id, created_by);
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, notification_settings")
        .eq("id", data.assigned_user_id)
        .single();

      const settings = (profile as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;
      if (profile?.email && settings.notify_on_create) {
        await sendNotificationEmail({
          to: profile.email,
          subject: "New task assigned",
          html: `<p>You have a new task: <b>${data.title}</b></p>`,
        });
      }
    }

    res.status(200).json({ ok: true, data });
    return;
  }

  // PATCH /api/tasks (update)
  if (req.method === "PATCH") {
    const body = readJsonBody(req);

    const id = String(body?.id || "").trim();
    if (!id || !isUuid(id)) {
      res.status(400).json({
        ok: false,
        error: { code: "BAD_REQUEST", message: "Missing/invalid id (uuid)" },
      });
      return;
    }

    // changed_by = auth.uid() z JWT
    const changed_by = userId;
    if (!changed_by) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_INVALID", message: "Cannot determine user from token" },
      });
      return;
    }

    // patch jako jsonb (tylko pola, które chcesz zmienić)
    const patch: any = {};
    if (body.title !== undefined) patch.title = String(body.title);
    if (body.description !== undefined) patch.description = body.description == null ? "" : String(body.description);
    if (body.priority !== undefined) patch.priority = String(body.priority);
    if (body.status !== undefined) patch.status = String(body.status);
    if (body.due_date !== undefined) patch.due_date = body.due_date == null ? "" : String(body.due_date);
    if (body.assigned_user_id !== undefined) patch.assigned_user_id = body.assigned_user_id || "";
    if (body.assigned_company_id !== undefined) patch.assigned_company_id = body.assigned_company_id || "";

    const patchKeys = Object.keys(patch);
    if (!isAdmin) {
      const allowedUserFields = new Set(["status", "priority", "due_date"]);
      const forbiddenFields = patchKeys.filter((field) => !allowedUserFields.has(field));
      if (forbiddenFields.length > 0) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Users can only update status, priority or due_date" },
        });
      }

      if (!patchKeys.some((field) => allowedUserFields.has(field))) {
        return res.status(400).json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "No editable fields provided" },
        });
      }
    }

    try {
      const { data: prevTask, error: prevTaskError } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, title, project_id")
        .eq("id", id)
        .single();

      if (prevTaskError || !prevTask) {
        return res.status((prevTaskError as any)?.status || 404).json({
          ok: false,
          error: {
            code: "SUPABASE",
            message: prevTaskError?.message || "Task not found",
            meta: { code: (prevTaskError as any)?.code, details: (prevTaskError as any)?.details },
          },
        });
      }

      if (!isAdmin && prevTask.assigned_user_id !== requester.id) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "You do not have access to this task" },
        });
      }

      if (!isAdmin && patch.status !== undefined) {
        const fromStatus = (prevTask.status || "").toUpperCase();
        const toStatus = String(patch.status || "").toUpperCase();
        const allowedTransitions: Record<string, string[]> = {
          OPEN: ["IN_PROGRESS"],
          IN_PROGRESS: ["DONE_WAITING_APPROVAL"],
        };

        const sameStatus = fromStatus === toStatus;
        if (!sameStatus && !allowedTransitions[fromStatus]?.includes(toStatus)) {
          return res.status(403).json({
            ok: false,
            error: { code: "FORBIDDEN", message: "Status change not allowed" },
          });
        }

        patch.status = toStatus;
      }

      const { data, error } = await (supabase as any).rpc("update_task_api", {
        p_id: id,
        p_changed_by: changed_by,
        p_patch: patch,
      });

      if (error) throw error;

      const { data: nextTask } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, title, project_id")
        .eq("id", id)
        .single();

      const statusChanged = prevTask?.status && nextTask?.status && prevTask.status !== nextTask.status;
      const assignedChanged = prevTask?.assigned_user_id !== nextTask?.assigned_user_id;

      if (assignedChanged && nextTask?.assigned_user_id) {
        await ensureProjectMembership(nextTask.project_id, nextTask.assigned_user_id, requester.id);
      }

      if (nextTask?.assigned_user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, notification_settings")
          .eq("id", nextTask.assigned_user_id)
          .single();

        const settings = (profile as any)?.notification_settings || DEFAULT_NOTIFICATION_SETTINGS;

        if (profile?.email && assignedChanged && settings.notify_on_assign) {
          await sendNotificationEmail({
            to: profile.email,
            subject: "Task assigned",
            html: `<p>You have been assigned: <b>${nextTask.title}</b></p>`,
          });
        }

        if (profile?.email && statusChanged && settings.notify_on_status) {
          await sendNotificationEmail({
            to: profile.email,
            subject: "Task status changed",
            html: `<p>Status updated for <b>${nextTask.title}</b>: ${prevTask?.status} → ${nextTask.status}</p>`,
          });
        }
      }

      res.status(200).json({ ok: true, data });
      return;
    } catch (e: any) {
      res.status(400).json({
        ok: false,
        error: {
          code: "SUPABASE",
          message: e?.message || "Supabase error",
          meta: { code: e?.code, details: e?.details },
        },
      });
      return;
    }
  }

  res.setHeader("Allow", "GET, POST, PATCH");
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET, POST or PATCH" } });
}
