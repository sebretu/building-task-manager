import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient, getUserIdFromRequest } from "@/lib/supabaseServer";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiOk | ApiErr>) {
  let supabase;
  let userId: string | null = null;

  try {
    ({ client: supabase, userId } = createServerSupabaseClient(req));
  } catch (e: any) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH_INVALID', message: 'Missing Bearer token' } });
  }

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
    if (assignedUserId) query = query.eq("assigned_user_id", assignedUserId);
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

    const priority = String(body?.priority || "MEDIUM").trim();
    const status = String(body?.status || "OPEN").trim();

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

    try {
      const { data: prevTask } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, title")
        .eq("id", id)
        .single();

      const { data, error } = await (supabase as any).rpc("update_task_api", {
        p_id: id,
        p_changed_by: changed_by,
        p_patch: patch,
      });

      if (error) throw error;

      const { data: nextTask } = await supabase
        .from("tasks")
        .select("status, assigned_user_id, title")
        .eq("id", id)
        .single();

      const statusChanged = prevTask?.status && nextTask?.status && prevTask.status !== nextTask.status;
      const assignedChanged = prevTask?.assigned_user_id !== nextTask?.assigned_user_id;

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
