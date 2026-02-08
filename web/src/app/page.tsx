"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  due_date: string | null;
  assigned_user_id?: string | null;
  plan_id?: string | null;
  x_norm?: number | null;
  y_norm?: number | null;
};

type PlanMeta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  limits?: Record<string, { maxX: number; maxY: number }>;
};

type User = {
  id: string;
  email: string;
  full_name: string;
};
type Profile = {
  id: string;
  full_name: string;
  email?: string;
};

type NotificationSettings = {
  notify_on_create: boolean;
  notify_on_status: boolean;
  notify_on_assign: boolean;
};

export default function Home() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sortBy, setSortBy] = useState("");
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    notify_on_create: true,
    notify_on_status: true,
    notify_on_assign: true,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [thumbByTask, setThumbByTask] = useState<Record<string, string | null>>({});
  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const p of profiles) map[p.id] = p;
    return map;
  }, [profiles]);

  const kanbanColumns = ["OPEN", "IN_PROGRESS", "DONE_WAITING_APPROVAL", "APPROVED", "REJECTED"] as const;

  function fixStorageUrl(u: string) {
    if (!u) return u;
    if (typeof window === "undefined") return u;

    const host = window.location.hostname;
    const proto = window.location.protocol;
    return u.replace(/^http:\/\/[^/]+:54321/i, `${proto}//${host}:54321`);
  }

  async function loadThumb(taskId: string) {
    const r = await fetch(`/api/task-photos?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    const raw = j?.ok && j.data && j.data.length ? j.data[0].url : null;
    const fixed = raw ? fixStorageUrl(raw) : null;
    setThumbByTask((prev) => ({ ...prev, [taskId]: fixed }));
  }

  async function loadPlanMeta(planId: string) {
    const r = await fetch(`/api/tiles/${encodeURIComponent(planId)}/meta`, { cache: "no-store" });
    if (!r.ok) {
      setMetaByPlan((prev) => ({ ...prev, [planId]: null }));
      return;
    }
    const meta = (await r.json()) as PlanMeta;
    setMetaByPlan((prev) => ({ ...prev, [planId]: meta }));
  }

  // Check session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error || !data?.session) {
          router.push("/auth/login");
          return;
        }

        // Get user profile
        const userEmail = data.session.user.email;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .eq("email", userEmail)
          .single();

        setUser(profile || { id: data.session.user.id, email: userEmail || "", full_name: "" });
        setSessionLoaded(true);
      } catch (e) {
        console.error("Session check failed:", e);
        router.push("/auth/login");
      }
    }

    checkSession();
  }, [router]);

  async function loadAll() {
    setErr(null);

    try {
      const ps = await apiGet<Project[]>("/api/projects");
      setProjects(ps);

      const pid = projectId || ps[0]?.id;
      if (!pid) return;
      setProjectId(pid);

      const statusQ = statusFilter ? `&status=${statusFilter}` : "";
      const priorityQ = priorityFilter ? `&priority=${priorityFilter}` : "";
      const assignedQ = assignedFilter ? `&assigned_user_id=${encodeURIComponent(assignedFilter)}` : "";
      const dueFromQ = dueFrom ? `&due_from=${encodeURIComponent(dueFrom)}` : "";
      const dueToQ = dueTo ? `&due_to=${encodeURIComponent(dueTo)}` : "";
      const sortQ = sortBy ? `&sort=${encodeURIComponent(sortBy)}` : "";
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${priorityQ}${assignedQ}${dueFromQ}${dueToQ}${sortQ}${qQ}`
      );
      setTasks(ts);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    }
  }

  useEffect(() => {
    if (!sessionLoaded) return;
    loadAll().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, statusFilter, priorityFilter, assignedFilter, dueFrom, dueTo, sortBy, projectId, qDebounced, sessionLoaded]);

  useEffect(() => {
    if (!sessionLoaded || profilesLoaded) return;
    apiGet<Profile[]>("/api/profiles?limit=1000")
      .then((data) => setProfiles(data || []))
      .finally(() => setProfilesLoaded(true));
  }, [sessionLoaded, profilesLoaded]);

  useEffect(() => {
    if (!sessionLoaded || settingsLoaded) return;
    apiGet<NotificationSettings>("/api/notification-settings")
      .then((data) => {
        if (data) setNotificationSettings(data);
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true));
  }, [sessionLoaded, settingsLoaded]);

  async function saveNotificationSettings(next: NotificationSettings) {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      await apiPost<NotificationSettings>("/api/notification-settings", next);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setSettingsError(message);
    } finally {
      setSettingsSaving(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    tasks.forEach((task) => {
      if (!Object.prototype.hasOwnProperty.call(thumbByTask, task.id)) {
        loadThumb(task.id).catch(() => {});
      }
    });

    const planIds = new Set(
      tasks
        .map((task) => task.plan_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    planIds.forEach((planId) => {
      if (!Object.prototype.hasOwnProperty.call(metaByPlan, planId)) {
        loadPlanMeta(planId).catch(() => {});
      }
    });
  }, [tasks, thumbByTask, metaByPlan]);

  function getTileUrl(task: Task) {
    if (!task.plan_id) return null;
    const meta = metaByPlan[task.plan_id];
    if (!meta) return null;

    const xNorm = typeof task.x_norm === "number" ? task.x_norm : Number(task.x_norm);
    const yNorm = typeof task.y_norm === "number" ? task.y_norm : Number(task.y_norm);
    if (!Number.isFinite(xNorm) || !Number.isFinite(yNorm)) return null;

    const zoomKey = String(meta.maxZoom);
    const maxX = meta.limits?.[zoomKey]?.maxX ?? meta.gridW - 1;
    const maxY = meta.limits?.[zoomKey]?.maxY ?? meta.gridH - 1;
    const x = Math.min(Math.max(0, Math.floor(xNorm * meta.gridW)), maxX);
    const y = Math.min(Math.max(0, Math.floor(yNorm * meta.gridH)), maxY);

    return `/api/tiles/${task.plan_id}/${meta.maxZoom}/${x}/${y}.png`;
  }

  if (!sessionLoaded || !user) {
    return <div style={{ padding: 24 }}>{t("common", "loading")}</div>;
  }

  const services = [
    {
      title: t("home", "servicePlansTitle"),
      body: t("home", "servicePlansBody"),
      href: "/plans",
    },
    {
      title: t("home", "serviceTasksTitle"),
      body: t("home", "serviceTasksBody"),
      href: "/",
    },
    {
      title: t("home", "serviceWorkflowTitle"),
      body: t("home", "serviceWorkflowBody"),
      href: "/",
    },
    {
      title: t("home", "serviceKanbanTitle"),
      body: t("home", "serviceKanbanBody"),
      href: "/",
    },
    {
      title: t("home", "servicePhotosTitle"),
      body: t("home", "servicePhotosBody"),
      href: "/",
    },
    {
      title: t("home", "serviceReportsTitle"),
      body: t("home", "serviceReportsBody"),
      href: "/",
    },
  ];

  return (
    <>
      <PWAInstallBanner />

      <main className="home-main">
        <section className="home-control">
          <div className="home-control-card">
            <div className="home-card-title">{t("home", "notifications")}</div>
            <div className="home-toggle-row">
              <label className="home-toggle">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_create}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_create: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => {});
                  }}
                />
                {t("home", "notifyOnCreate")}
              </label>
              <label className="home-toggle">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_status}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_status: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => {});
                  }}
                />
                {t("home", "notifyOnStatus")}
              </label>
              <label className="home-toggle">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_assign}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_assign: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => {});
                  }}
                />
                {t("home", "notifyOnAssign")}
              </label>
              {settingsSaving && <span className="home-card-note">{t("home", "savingSettings")}</span>}
              {settingsError && <span className="home-card-error">{settingsError}</span>}
            </div>
          </div>
        </section>
        {err && <div className="home-card-error">{err}</div>}
        <section className="home-task-panel">
            <div className="home-section-header">
              <h2>{t("home", "title")}</h2>
              <p>{t("home", "tasksSubtitle")}</p>
            </div>

            <div className="home-filters">
              <label>
                {t("home", "selectProject")}:
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setOffset(0);
                  }}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t("common", "search")}:
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("home", "search")}
                />
              </label>

              <div className="home-status-filter">
                {[null, "OPEN", "DONE_WAITING_APPROVAL", "APPROVED"].map((s) => (
                  <button
                    key={s ?? "ALL"}
                    onClick={() => {
                      setStatusFilter(s);
                      setOffset(0);
                    }}
                    className={statusFilter === s ? "home-pill active" : "home-pill"}
                  >
                    {s ? t("taskStatus", s) : t("taskStatus", "ALL")}
                  </button>
                ))}
              </div>

              <label>
                {t("home", "filterPriority")}:
                <select
                  value={priorityFilter || ""}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value || null);
                    setOffset(0);
                  }}
                >
                  <option value="">{t("taskStatus", "ALL")}</option>
                  <option value="LOW">{t("taskPriority", "LOW")}</option>
                  <option value="MEDIUM">{t("taskPriority", "MEDIUM")}</option>
                  <option value="HIGH">{t("taskPriority", "HIGH")}</option>
                  <option value="CRITICAL">{t("taskPriority", "CRITICAL")}</option>
                </select>
              </label>

              <label>
                {t("home", "filterAssignee")}:
                <select
                  value={assignedFilter}
                  onChange={(e) => {
                    setAssignedFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t("taskStatus", "ALL")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {t("home", "dueFrom")}:
                <input
                  type="date"
                  value={dueFrom}
                  onChange={(e) => {
                    setDueFrom(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>

              <label>
                {t("home", "dueTo")}:
                <input
                  type="date"
                  value={dueTo}
                  onChange={(e) => {
                    setDueTo(e.target.value);
                    setOffset(0);
                  }}
                />
              </label>

              <label>
                {t("home", "sortBy")}:
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t("home", "sortNewest")}</option>
                  <option value="due_asc">{t("home", "sortDueSoon")}</option>
                  <option value="due_desc">{t("home", "sortDueLatest")}</option>
                  <option value="priority_desc">{t("home", "sortPriority")}</option>
                </select>
              </label>
            </div>

            <div className="home-view-toggle">
              <span>{t("home", "viewMode")}:</span>
              <button
                onClick={() => setViewMode("list")}
                className={viewMode === "list" ? "home-toggle active" : "home-toggle"}
              >
                {t("home", "viewList")}
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={viewMode === "kanban" ? "home-toggle active" : "home-toggle"}
              >
                {t("home", "viewKanban")}
              </button>
            </div>

            <div className="home-pagination">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                disabled={offset === 0}
              >
                {t("home", "prev")}
              </button>
              <button onClick={() => setOffset((o) => o + limit)}>{t("home", "next")}</button>
              <label>
                {t("home", "limit")}:
                <input
                  type="number"
                  value={limit}
                  min={1}
                  max={200}
                  onChange={(e) => {
                    setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 10)));
                    setOffset(0);
                  }}
                />
              </label>
            </div>

          {viewMode === "list" ? (
            <div className="tasks-grid">
              {tasks.map((task) => {
                const thumb = thumbByTask[task.id];
                const tileUrl = getTileUrl(task);
                const statusLabel = t("taskStatus", task.status, task.status);
                const priorityLabel = t("taskPriority", task.priority, task.priority);
                const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                const assigneeLabel = assignee?.full_name || assignee?.email || t("taskDrawer", "assignedUser");
                const assigneeText = assignee ? assigneeLabel : `${t("taskDrawer", "assignedUser")}: —`;

                return (
                  <article key={task.id} className="task-card">
                    <div className="task-card__media">
                      {thumb ? (
                        <img src={thumb} alt={t("home", "photoLabel")} />
                      ) : (
                        <div className="task-card__media-placeholder">
                          <span aria-hidden="true">📷</span>
                          <p>{t("home", "noPhoto")}</p>
                        </div>
                      )}
                    </div>

                    <div className="task-card__body">
                      <div className="task-card__status-row">
                        <span className="task-card__badge">{statusLabel}</span>
                        <span className="task-card__pill">{priorityLabel}</span>
                      </div>
                      <h3>{task.title}</h3>
                      <p className="task-card__note">
                        {assigneeText} · {t("taskDrawer", "dueDate")}: {dueLabel}
                      </p>
                    </div>

                    <div className="task-card__map">
                      {tileUrl ? (
                        <img src={tileUrl} alt={t("home", "mapLabel")} />
                      ) : (
                        <div className="task-card__map-placeholder">
                          <span aria-hidden="true">📍</span>
                          <small>{t("home", "noTile")}</small>
                        </div>
                      )}
                    </div>

                    <div className="task-card__footer">
                      <span>
                        {priorityLabel} · {dueLabel}
                      </span>
                      <Link href={`/task/${task.id}`} className="task-card__cta">
                        {t("home", "serviceMore")}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="home-kanban">
              {kanbanColumns.map((status) => {
                const items = tasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="home-kanban-column">
                    <div className="home-kanban-header">
                      {t("taskStatus", status)} ({items.length})
                    </div>
                    <div className="home-kanban-list">
                      {items.length === 0 && <div className="home-empty">{t("home", "noTasks")}</div>}
                      {items.map((task) => {
                        const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                        const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                        return (
                          <Link key={task.id} href={`/task/${task.id}`} className="home-kanban-card">
                            <div className="home-kanban-title">{task.title}</div>
                            <div className="home-kanban-meta">
                              <span className="home-kanban-priority">
                                {t("taskPriority", task.priority, task.priority)}
                              </span>
                              <span>{t("taskDrawer", "dueDate")}: {dueLabel}</span>
                            </div>
                            <div className="home-kanban-assignee">
                              {t("taskDrawer", "assignedUser")}: {assignee?.full_name || assignee?.email || "—"}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <footer className="home-footer">
        {/* Footer content removed as requested */}
      </footer>
    </>
  );
}
