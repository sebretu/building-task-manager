"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  due_date: string | null;
  assigned_user_id?: string | null;
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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

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
      <div className="home-hero">
        <header className="home-topbar">
          <div className="home-logo">
            <span className="home-logo-mark" />
            <div>
              <div className="home-logo-title">InspectHero</div>
              <div className="home-logo-sub">Facility Task Control</div>
            </div>
          </div>
          <nav className="home-nav">
            <Link href="/" className="home-nav-link">
              {t("nav", "tasks")}
            </Link>
            <Link href="/plans" className="home-nav-link">
              {t("nav", "plans")}
            </Link>
            <Link href="/users" className="home-nav-link">
              {t("nav", "users")}
            </Link>
            <Link href="/companies" className="home-nav-link">
              {t("nav", "companies")}
            </Link>
          </nav>
          <div className="home-topbar-actions">
            <LanguageSwitcher />
            <button className="home-logout" onClick={handleLogout}>
              {t("common", "logout")}
            </button>
          </div>
        </header>

        <section className="home-hero-content">
          <div className="home-hero-text">
            <div className="home-hero-kicker">{t("home", "heroKicker")}</div>
            <h1 className="home-hero-title">{t("home", "heroTitle")}</h1>
            <p className="home-hero-subtitle">{t("home", "heroSubtitle")}</p>
            <div className="home-hero-actions">
              <Link href="/plans" className="home-hero-primary">
                {t("home", "heroPrimary")}
              </Link>
              <Link href="/" className="home-hero-secondary">
                {t("home", "heroSecondary")}
              </Link>
            </div>
            <div className="home-hero-user">
              <span className="home-hero-user-label">{t("home", "signedInAs")}</span>
              <span>{user.full_name || user.email}</span>
            </div>
          </div>
          <div className="home-hero-media">
            <div className="home-hero-panel">
              <div className="home-hero-panel-title">{t("home", "heroPanelTitle")}</div>
              <div className="home-hero-panel-body">{t("home", "heroPanelBody")}</div>
              <div className="home-hero-panel-tags">
                <span>{t("home", "heroTagPlanning")}</span>
                <span>{t("home", "heroTagSafety")}</span>
                <span>{t("home", "heroTagEfficiency")}</span>
              </div>
            </div>
            <div className="home-hero-grid" />
          </div>
        </section>
      </div>

      <main className="home-main">
        <section className="home-services">
          <div className="home-section-header">
            <h2>{t("home", "servicesTitle")}</h2>
            <p>{t("home", "servicesSubtitle")}</p>
          </div>
          <div className="home-services-grid">
            {services.map((item) => (
              <Link key={item.title} href={item.href} className="home-service-card">
                <div className="home-service-title">{item.title}</div>
                <div className="home-service-body">{item.body}</div>
                <div className="home-service-link">{t("home", "serviceMore")}</div>
              </Link>
            ))}
          </div>
        </section>

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
            <ul className="home-task-list">
              {tasks.map((task) => (
                <li key={task.id}>
                  <Link href={`/task/${task.id}`} className="home-task-link">
                    <span className="home-task-pill">{t("taskStatus", task.status, task.status)}</span>
                    <span className="home-task-title">{task.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
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
        <div>
          InspectHero GmbH · Heinrich-Hertz-Str. 22a · 40699 Erkrath
        </div>
        <div>info@inspecthero.pl · +49 211 210 233 00</div>
      </footer>
    </>
  );
}
