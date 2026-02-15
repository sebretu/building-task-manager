"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import type { Language } from "@/lib/translations";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";
import TaskDrawer from "@/components/TaskDrawer";
import { useSync } from "@/hooks/useSync";

function PendingSyncIndicator() {
  const { pendingCount, isSyncing } = useSync();
  const { t } = useLanguage();

  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <div className="mx-4 mb-4 p-3 bg-card rounded-xl border border-border flex items-center gap-3 shadow-sm">
      <div
        className={`w-2.5 h-2.5 rounded-full ${isSyncing ? "bg-blue-600 animate-pulse" : "bg-amber-500"}`}
      />
      <div className="text-sm font-semibold text-foreground">
        {isSyncing
          ? t("home", "syncing", "Syncing data...")
          : t("home", "pendingTasks", `Pending offline tasks: ${pendingCount}`)}
      </div>
    </div>
  );
}

type Plan = {
  id: string;
  name: string;
  floor_id: string;
  version?: number;
  floor?: {
    name: string;
    building?: {
      name: string;
    };
  };
};

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
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
  role?: string;
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

type TaskThumb = {
  url: string | null;
  type: "BEFORE" | "AFTER" | null;
};

export default function Home() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [sortBy, setSortBy] = useState("");
  const { t, language } = useLanguage();
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
  const [thumbByTask, setThumbByTask] = useState<Record<string, TaskThumb>>({});
  const [metaByPlan, setMetaByPlan] = useState<Record<string, PlanMeta | null>>({});
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [taskTranslationMap, setTaskTranslationMap] = useState<Record<string, string>>({});
  const [taskTranslationLang, setTaskTranslationLang] = useState<Language | null>(null);
  const [taskTranslating, setTaskTranslating] = useState(false);
  const [taskTranslationError, setTaskTranslationError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // New Task Flow State
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskPlanId, setNewTaskPlanId] = useState("");
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [createDraft, setCreateDraft] = useState<{
    project_id: string;
    plan_id: string;
    x_norm: number;
    y_norm: number;
    created_by?: string;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!showNewTaskModal) return;
    if (!newTaskProjectId) {
      setAvailablePlans([]);
      return;
    }

    setLoadingPlans(true);
    apiGet<any[]>(`/api/plans?projectId=${encodeURIComponent(newTaskProjectId)}`)
      .then((data) => {
        // Map to simpler Plan structure if needed, or just use what we get
        // Assuming API returns object with floor_id, etc.
        // We need building/floor names for better UX, but for now just list them
        // Should ideally fetch hierarchy or enrich info. 
        // For simplicity, let's just show Plan version? Or maybe we can fetch floors too?
        // Let's rely on what we have. API /api/plans returns Plan objects. 
        // We probably want to group by floor?
        // Let's just list them for now. 
        // Ideally we should use the same logic as loadAll in plans page but simplified.
        setAvailablePlans(data || []);
        if (data && data.length > 0 && !newTaskPlanId) {
          setNewTaskPlanId(data[0].id);
        }
      })
      .catch((e) => console.error("Failed to load plans", e))
      .finally(() => setLoadingPlans(false));
  }, [showNewTaskModal, newTaskProjectId]);

  const openNewTaskModal = () => {
    setNewTaskProjectId(projectId || (projects[0]?.id ?? ""));
    setNewTaskPlanId("");
    setShowNewTaskModal(true);
  };

  const closeNewTaskModal = () => {
    setShowNewTaskModal(false);
  };

  const handleStartCreateTask = () => {
    if (!newTaskProjectId || !newTaskPlanId) return;

    setCreateDraft({
      project_id: newTaskProjectId,
      plan_id: newTaskPlanId,
      x_norm: 0.5, // Default center
      y_norm: 0.5, // Default center
      created_by: user?.id,
    });
    setDrawerOpen(true);
    closeNewTaskModal();
  };

  const handleTaskCreated = () => {
    loadAll(); // Reload tasks list
  };

  useEffect(() => {
    if (sessionLoaded) {
      getToken().then(setToken);
    }
  }, [sessionLoaded]);

  const profileById = useMemo(() => {
    const map: Record<string, Profile> = {};
    for (const p of profiles) map[p.id] = p;
    return map;
  }, [profiles]);

  const kanbanColumns = ["OPEN", "IN_PROGRESS", "DONE_WAITING_APPROVAL", "APPROVED", "REJECTED"] as const;
  const statusBadgeClassByCode: Record<string, string> = {
    OPEN: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    IN_PROGRESS: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    DONE_WAITING_APPROVAL: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    APPROVED: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    REJECTED: "bg-red-500/10 text-red-600 border-red-500/20",
  };

  const getTranslatedText = (scope: string, id: string, fallback?: string | null) => {
    if (!id) return fallback ?? "";
    if (taskTranslationLang !== language) return fallback ?? "";
    const key = `${scope}:${id}`;
    const candidate = taskTranslationMap[key];
    if (!candidate) return fallback ?? "";
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : fallback ?? "";
  };

  function fixStorageUrl(u: string) {
    if (!u) return u;
    if (typeof window === "undefined") return u;

    const host = window.location.hostname;
    const proto = window.location.protocol;
    return u.replace(/^http:\/\/[^/]+:54321/i, `${proto}//${host}:54321`);
  }

  type TaskPhotoRow = { id: string; url?: string | null; photo_type?: "BEFORE" | "AFTER" | null };

  const loadThumb = useCallback(async (taskId: string) => {
    try {
      const fetchPhotos = async (phase?: "AFTER" | "BEFORE") => {
        const phaseParam = phase ? `&phase=${phase}` : "";
        return apiGet<TaskPhotoRow[]>(
          `/api/task-photos?taskId=${encodeURIComponent(taskId)}${phaseParam}&limit=1`
        );
      };

      let photos = await fetchPhotos("AFTER");
      if (!Array.isArray(photos) || photos.length === 0) {
        photos = await fetchPhotos();
      }

      const selected = Array.isArray(photos) && photos.length > 0 ? photos[0] : null;
      const raw = selected?.url ?? null;
      const fixed = raw ? fixStorageUrl(raw) : null;
      const phase = selected?.photo_type ?? null;
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: fixed, type: phase } }));
    } catch (loadErr) {
      console.warn("[home] loadThumb failed", loadErr);
      setThumbByTask((prev) => ({ ...prev, [taskId]: { url: null, type: null } }));
    }
  }, []);

  async function loadPlanMeta(planId: string) {
    try {
      const token = await getToken();
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch(`/api/tiles/${encodeURIComponent(planId)}/meta`, {
        cache: "no-store",
        headers,
      });

      if (!r.ok) {
        setMetaByPlan((prev) => ({ ...prev, [planId]: null }));
        return;
      }
      const meta = (await r.json()) as PlanMeta;
      setMetaByPlan((prev) => ({ ...prev, [planId]: meta }));
    } catch {
      setMetaByPlan((prev) => ({ ...prev, [planId]: null }));
    }
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
          .select("id, email, full_name, role")
          .eq("email", userEmail)
          .single();

        setUser(
          profile || {
            id: data.session.user.id,
            email: userEmail || "",
            full_name: "",
            role: "USER",
          }
        );
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
      .catch(() => { })
      .finally(() => setSettingsLoaded(true));
  }, [sessionLoaded, settingsLoaded]);

  useEffect(() => {
    if (!user?.id) return;
    if ((user.role || "").toUpperCase() === "ADMIN") return;
    setAssignedFilter((prev) => (prev === user.id ? prev : user.id));
  }, [user]);

  useEffect(() => {
    if (!tasks.length) {
      setTaskTranslationMap({});
      setTaskTranslationLang(language);
      setTaskTranslationError(null);
      setTaskTranslating(false);
      return;
    }

    const items: { key: string; text: string }[] = [];
    tasks.forEach((task) => {
      const title = task.title?.trim();
      if (title) items.push({ key: `task.title:${task.id}`, text: title });
      const description = task.description?.trim();
      if (description) items.push({ key: `task.description:${task.id}`, text: description });
    });

    if (items.length === 0) {
      setTaskTranslationMap({});
      setTaskTranslationLang(language);
      setTaskTranslationError(null);
      setTaskTranslating(false);
      return;
    }

    let alive = true;
    setTaskTranslating(true);
    setTaskTranslationError(null);

    apiPost<{ translations: string[] }>("/api/translate", {
      targetLang: language,
      texts: items.map((item) => item.text),
    })
      .then((payload) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        (payload.translations || []).forEach((value, idx) => {
          const key = items[idx]?.key;
          if (key && typeof value === "string") {
            next[key] = value;
          }
        });
        setTaskTranslationMap(next);
        setTaskTranslationLang(language);
      })
      .catch((translationErr: any) => {
        if (!alive) return;
        setTaskTranslationError(translationErr?.message || String(translationErr));
        setTaskTranslationMap({});
      })
      .finally(() => {
        if (!alive) return;
        setTaskTranslating(false);
      });

    return () => {
      alive = false;
    };
  }, [tasks, language]);

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
        loadThumb(task.id).catch(() => { });
      }
    });

    const planIds = new Set(
      tasks
        .map((task) => task.plan_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );

    planIds.forEach((planId) => {
      if (!Object.prototype.hasOwnProperty.call(metaByPlan, planId)) {
        loadPlanMeta(planId).catch(() => { });
      }
    });
  }, [tasks, thumbByTask, metaByPlan, loadThumb]);

  useEffect(() => {
    function handlePhotoAdded(event: Event) {
      const detail = (event as CustomEvent)?.detail;
      const taskIdFromEvent = detail?.taskId;
      if (!taskIdFromEvent) return;
      loadThumb(taskIdFromEvent).catch(() => { });
    }

    window.addEventListener("task-photo-added", handlePhotoAdded as EventListener);

    // Listen for task creation to reload list
    function onTaskCreated() {
      handleTaskCreated();
    }
    window.addEventListener("task-created", onTaskCreated as EventListener);

    return () => {
      window.removeEventListener("task-photo-added", handlePhotoAdded as EventListener);
      window.removeEventListener("task-created", onTaskCreated as EventListener);
    };
  }, [loadThumb]);

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

    return `/api/tiles/${task.plan_id}/${meta.maxZoom}/${x}/${y}.png` + (token ? `?token=${token}` : "");
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

      <main className="w-full max-w-7xl mx-auto px-4 py-8 flex flex-col gap-8">
        <section className="w-full grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
            <div className="font-extrabold text-foreground">{t("home", "notifications")}</div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background cursor-pointer text-sm font-semibold text-foreground hover:bg-accent transition-colors">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_create}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_create: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                {t("home", "notifyOnCreate")}
              </label>
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background cursor-pointer text-sm font-semibold text-foreground hover:bg-accent transition-colors">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_status}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_status: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                {t("home", "notifyOnStatus")}
              </label>
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background cursor-pointer text-sm font-semibold text-foreground hover:bg-accent transition-colors">
                <input
                  type="checkbox"
                  checked={notificationSettings.notify_on_assign}
                  onChange={(e) => {
                    const next = { ...notificationSettings, notify_on_assign: e.target.checked };
                    setNotificationSettings(next);
                    saveNotificationSettings(next).catch(() => { });
                  }}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                {t("home", "notifyOnAssign")}
              </label>
              {settingsSaving && <span className="text-xs text-muted-foreground">{t("home", "savingSettings")}</span>}
              {settingsError && <span className="text-xs text-red-500">{settingsError}</span>}
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 flex items-center justify-center shadow-sm">
            <button
              onClick={openNewTaskModal}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-3 rounded-full font-bold shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
            >
              <span className="w-5 h-5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L4 5V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V5L12 2Z"
                    stroke="currentColor" strokeWidth="2" />
                  <path d="M8 12L11 15L16 9"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              {t("home", "createNewTask", "Create new task")}
            </button>
          </div>
        </section>

        {/* Offline Sync Indicator */}
        <PendingSyncIndicator />

        <div className="text-red-500 text-sm font-medium">{err}</div>
        <section className="bg-card border border-border rounded-2xl p-6 md:p-8 flex flex-col gap-6 shadow-sm">
          <div className="mb-2">
            <h2 className="text-2xl font-extrabold text-foreground tracking-tight">{t("home", "title")}</h2>
            <p className="text-muted-foreground">{t("home", "tasksSubtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("home", "selectProject")}:
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setOffset(0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("common", "search")}:
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("home", "search")}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </label>

            <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2 lg:col-span-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("taskStatus", "ALL")}</span>
              <div className="flex flex-wrap gap-2">
                {[null, "OPEN", "DONE_WAITING_APPROVAL", "APPROVED"].map((s) => (
                  <button
                    key={s ?? "ALL"}
                    onClick={() => {
                      setStatusFilter(s);
                      setOffset(0);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold uppercase transition-all ${statusFilter === s
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                      : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      }`}
                  >
                    {s ? t("taskStatus", s) : t("taskStatus", "ALL")}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("home", "filterPriority")}:
              <select
                value={priorityFilter || ""}
                onChange={(e) => {
                  setPriorityFilter(e.target.value || null);
                  setOffset(0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">{t("taskStatus", "ALL")}</option>
                <option value="LOW">{t("taskPriority", "LOW")}</option>
                <option value="MEDIUM">{t("taskPriority", "MEDIUM")}</option>
                <option value="HIGH">{t("taskPriority", "HIGH")}</option>
                <option value="CRITICAL">{t("taskPriority", "CRITICAL")}</option>
              </select>
            </label>

            {(user?.role || "").toUpperCase() === "ADMIN" && (
              <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {t("home", "filterAssignee")}:
                <select
                  value={assignedFilter}
                  onChange={(e) => {
                    setAssignedFilter(e.target.value);
                    setOffset(0);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  <option value="">{t("taskStatus", "ALL")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("home", "dueFrom")}:
              <input
                type="date"
                value={dueFrom}
                onChange={(e) => {
                  setDueFrom(e.target.value);
                  setOffset(0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("home", "dueTo")}:
              <input
                type="date"
                value={dueTo}
                onChange={(e) => {
                  setDueTo(e.target.value);
                  setOffset(0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              {t("home", "sortBy")}:
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setOffset(0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option value="">{t("home", "sortNewest")}</option>
                <option value="due_asc">{t("home", "sortDueSoon")}</option>
                <option value="due_desc">{t("home", "sortDueLatest")}</option>
                <option value="priority_desc">{t("home", "sortPriority")}</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
            <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-wide">
              <span>{t("home", "viewMode")}:</span>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 rounded-full border transition-all ${viewMode === "list"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/50"
                  }`}
              >
                {t("home", "viewList")}
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={`px-3 py-1.5 rounded-full border transition-all ${viewMode === "kanban"
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/50"
                  }`}
              >
                {t("home", "viewKanban")}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-bold uppercase disabled:opacity-50 hover:bg-muted transition-colors"
              >
                {t("home", "prev")}
              </button>
              <button
                onClick={() => setOffset((o) => o + limit)}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-bold uppercase hover:bg-muted transition-colors"
              >
                {t("home", "next")}
              </button>
              <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
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
                  className="w-16 px-2 py-1 rounded border border-border bg-background text-center focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </label>
            </div>
          </div>

          {taskTranslating && (
            <div className="home-card-note">
              {t("taskDrawer", "autoTranslateLoading", "Translating content...")} ({language.toUpperCase()})
            </div>
          )}
          {taskTranslationError && (
            <div className="home-card-error">
              {t("taskDrawer", "autoTranslateError", "Auto translation failed")}: {taskTranslationError}
            </div>
          )}

          {viewMode === "list" ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {tasks.map((task) => {
                const thumb = thumbByTask[task.id];
                const thumbUrl = thumb?.url || null;
                const thumbType = thumb?.type || null;
                const thumbAlt =
                  thumbType === "AFTER"
                    ? t("home", "photoLabelAfter", "After photo")
                    : thumbType === "BEFORE"
                      ? t("home", "photoLabelBefore", "Before photo")
                      : t("home", "photoLabel", "Task photo");
                const thumbBadge =
                  thumbType === "AFTER"
                    ? t("home", "photoBadgeAfter", "After")
                    : thumbType === "BEFORE"
                      ? t("home", "photoBadgeBefore", "Before")
                      : null;
                const tileUrl = getTileUrl(task);
                const taskNumberLabel = getTaskNumericLabel(task.id);
                const statusLabel = t("taskStatus", task.status, task.status);
                const statusClassName = statusBadgeClassByCode[task.status] || "bg-gray-100 text-gray-700 border-gray-200";
                const priorityLabel = t("taskPriority", task.priority, task.priority);
                const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                const assigneeLabel = assignee?.full_name || assignee?.email || t("taskDrawer", "assignedUser");
                const assigneeText = assignee ? assigneeLabel : `${t("taskDrawer", "assignedUser")}: —`;
                const translatedTitle = getTranslatedText("task.title", task.id, task.title);
                const translatedDescription = getTranslatedText("task.description", task.id, task.description);
                const descriptionRaw = translatedDescription?.trim() || "";
                const hasDescription = descriptionRaw.length > 0;
                const descriptionPreview = hasDescription && descriptionRaw.length > 220 ? `${descriptionRaw.slice(0, 220)}…` : descriptionRaw;
                const descriptionContent = hasDescription ? descriptionPreview : t("home", "noDescription");

                return (
                  <Link href={`/task/${task.id}`} key={task.id} className="group relative grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-6 md:gap-8 p-6 md:p-8 rounded-3xl border border-border bg-card shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden">
                    <div className="relative aspect-video md:h-full md:aspect-auto rounded-2xl border border-border/50 overflow-hidden bg-muted flex items-center justify-center">
                      {thumbUrl ? (
                        <>
                          <img src={thumbUrl} alt={thumbAlt} className="w-full h-full object-contain" />
                          {thumbBadge && (
                            <span
                              className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white shadow-lg border border-white/20 backdrop-blur-md ${thumbType === "AFTER"
                                ? "bg-gradient-to-br from-emerald-500/90 to-green-600/90"
                                : "bg-gradient-to-br from-amber-400/90 to-orange-600/90"
                                }`}
                            >
                              {thumbBadge}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground p-4 text-center">
                          <span aria-hidden="true" className="text-4xl opacity-50">📷</span>
                          <p className="text-xs font-medium">{t("home", "noPhoto", "No photo yet")}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${statusClassName}`}>
                          {statusLabel}
                        </span>
                        <span className="px-2.5 py-1 rounded-full border border-border bg-background text-[11px] font-bold text-foreground">
                          {priorityLabel}
                        </span>
                      </div>

                      <h3 className="text-xl font-extrabold leading-tight text-foreground transition-colors group-hover:text-primary">
                        {translatedTitle || task.title}
                      </h3>

                      <p className={`text-sm leading-relaxed ${hasDescription ? "text-muted-foreground" : "text-muted-foreground/50 italic"}`}>
                        {descriptionContent}
                      </p>

                      <p className="mt-auto pt-4 text-xs font-medium text-muted-foreground border-t border-border flex flex-wrap gap-x-1">
                        <span className="font-bold text-foreground">{assigneeText}</span>
                        <span>·</span>
                        <span>{t("taskDrawer", "dueDate")}: {dueLabel}</span>
                      </p>
                    </div>

                    {/* Map Overlay in Grid Layout (Optional - hiding for cleaner layout or keeping as small inset?) 
                        The original design had map below media or side-by-side. 
                        Let's put the map as a small inset or just keep it simple.
                        Original had "map" area. Let's add it below media if needed, or maybe integrated.
                        Actually, original grid layout was: media body; map body; footer footer.
                        Let's simplify to: Left Col (Media + Map), Right Col (Body).
                    */}
                    <div className="hidden md:block absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent -z-10 rounded-bl-[100px]" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex overflow-x-auto pb-8 gap-6 snap-x snap-mandatory">
              {kanbanColumns.map((status) => {
                const items = tasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="flex-shrink-0 w-80 flex flex-col gap-4 bg-muted/30 rounded-2xl p-4 border border-border/50 snap-center h-fit max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between px-2">
                      <h4 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">
                        {t("taskStatus", status)}
                      </h4>
                      <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-xs font-bold">
                        {items.length}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3 min-h-[100px]">
                      {items.length === 0 && (
                        <div className="flex items-center justify-center h-24 border-2 border-dashed border-border/50 rounded-xl text-xs text-muted-foreground font-medium">
                          {t("home", "noTasks")}
                        </div>
                      )}
                      {items.map((task) => {
                        const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                        const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                        const translatedTitle = getTranslatedText("task.title", task.id, task.title);
                        return (
                          <Link key={task.id} href={`/task/${task.id}`} className="block p-4 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 group">
                            <div className="font-bold text-sm text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-2">
                              {translatedTitle || task.title}
                            </div>
                            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-muted-foreground mb-3">
                              <span className={`px-1.5 py-0.5 rounded border ${task.priority === 'CRITICAL' ? 'bg-red-100 text-red-700 border-red-200' :
                                task.priority === 'HIGH' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                  'bg-muted text-muted-foreground border-border'
                                }`}>
                                {t("taskPriority", task.priority, task.priority)}
                              </span>
                              <span>{dueLabel}</span>
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-2 border-t border-border/50">
                              <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary">
                                {(assignee?.full_name?.[0] || assignee?.email?.[0] || "?").toUpperCase()}
                              </div>
                              <span className="truncate max-w-[150px]">
                                {assignee?.full_name || assignee?.email || t("common", "unassigned")}
                              </span>
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
        {/* New Task Selection Modal */}
        {showNewTaskModal && (
          <div
            className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={closeNewTaskModal}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-3xl p-8 w-full max-w-md grid gap-6 shadow-2xl border border-border animate-in zoom-in-95 duration-200"
            >
              <div>
                <h3 className="text-xl font-extrabold text-foreground tracking-tight">
                  {t("taskDrawer", "newTask", "New Task")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("home", "newTaskModalSubtitle", "Select a project and plan to attach the task to.")}
                </p>
              </div>

              <label className="flex flex-col gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {t("home", "selectProject", "Select Project")}
                <select
                  value={newTaskProjectId}
                  onChange={(e) => {
                    setNewTaskProjectId(e.target.value);
                    setNewTaskPlanId("");
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                {t("home", "selectPlan", "Select Plan")}
                <select
                  value={newTaskPlanId}
                  onChange={(e) => setNewTaskPlanId(e.target.value)}
                  disabled={loadingPlans || availablePlans.length === 0}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {availablePlans.length === 0 ? (
                    <option value="">{loadingPlans ? t("common", "loading") : t("plansPage", "noPlans")}</option>
                  ) : (
                    availablePlans.map((p) => {
                      const bName = p.floor?.building?.name;
                      const fName = p.floor?.name;
                      const displayName = bName && fName
                        ? `${bName} - ${fName}`
                        : p.name || `Plan v${p.version ?? "?"}`;

                      return (
                        <option key={p.id} value={p.id}>
                          {displayName}
                        </option>
                      );
                    })
                  )}
                </select>
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeNewTaskModal}
                  className="flex-1 px-4 py-3.5 rounded-xl border border-border bg-background text-foreground font-extrabold hover:bg-muted transition-colors"
                >
                  {t("common", "cancel")}
                </button>
                <button
                  onClick={() => {
                    if (newTaskPlanId) {
                      router.push(`/plan/${newTaskPlanId}`);
                    }
                  }}
                  disabled={!newTaskProjectId || !newTaskPlanId}
                  className="flex-1 px-4 py-3.5 rounded-xl border border-transparent bg-primary text-primary-foreground font-extrabold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {t("common", "continue", "Continue")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Drawer for Creation/Edit */}
        <TaskDrawer
          open={drawerOpen}
          taskId={null}
          createDraft={createDraft}
          onClose={() => {
            setDrawerOpen(false);
            setCreateDraft(null);
          }}
          uploadedBy={user?.id || ""}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      </main>
    </>
  );
}
