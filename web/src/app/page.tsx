"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
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
    const t = setTimeout(() => {
      setQDebounced(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (!sessionLoaded || !user) {
    return <div style={{ padding: 24 }}>{t("common", "loading")}</div>;
  }

  return (
    <>
      <PWAInstallBanner />
      <main style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>{t("home", "title")}</h1>
          <p style={{ margin: "8px 0 0 0", color: "#666", fontSize: "14px" }}>
            👤 {user.full_name || user.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <LanguageSwitcher />
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 16px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            🚪 {t("common", "logout")}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: "20px" }}>
        <Link href="/plans" style={{ textDecoration: "none" }}>
          → {t("nav", "plans")}
        </Link>
        <Link href="/users" style={{ textDecoration: "none" }}>
          → {t("nav", "users")}
        </Link>
        <Link href="/companies" style={{ textDecoration: "none" }}>
          → {t("nav", "companies")}
        </Link>
      </div>

      {err && (
        <div style={{ marginBottom: 12, color: "crimson" }}>
          {err}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>
          {t("home", "selectProject")}:{" "}
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
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("home", "search")}
          style={{ width: 280 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        {[null, "OPEN", "DONE_WAITING_APPROVAL", "APPROVED"].map((s) => (
          <button
            key={s ?? "ALL"}
            onClick={() => {
              setStatusFilter(s);
              setOffset(0);
            }}
            style={{ marginRight: 8, fontWeight: statusFilter === s ? "bold" : "normal" }}
          >
            {s ? t("taskStatus", s) : t("taskStatus", "ALL")}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
            <option value="URGENT">{t("taskPriority", "URGENT")}</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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

        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
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

      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{t("home", "viewMode")}:</span>
        <button
          onClick={() => setViewMode("list")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(17,24,39,0.15)",
            background: viewMode === "list" ? "#111827" : "#fff",
            color: viewMode === "list" ? "#fff" : "#111827",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {t("home", "viewList")}
        </button>
        <button
          onClick={() => setViewMode("kanban")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(17,24,39,0.15)",
            background: viewMode === "kanban" ? "#111827" : "#fff",
            color: viewMode === "kanban" ? "#fff" : "#111827",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {t("home", "viewKanban")}
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          disabled={offset === 0}
          style={{ marginRight: 8 }}
        >
          {t("home", "prev")}
        </button>
        <button onClick={() => setOffset((o) => o + limit)} style={{ marginRight: 8 }}>
          {t("home", "next")}
        </button>
        <label style={{ marginLeft: 12 }}>
          {t("home", "limit")}:{" "}
          <input
            type="number"
            value={limit}
            min={1}
            max={200}
            onChange={(e) => {
              setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 10)));
              setOffset(0);
            }}
            style={{ width: 72 }}
          />
        </label>
      </div>

      {viewMode === "list" ? (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <Link href={`/task/${task.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                [{t("taskStatus", task.status, task.status)}] {task.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {kanbanColumns.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            return (
              <div key={status} style={{ background: "#f9fafb", border: "1px solid rgba(17,24,39,0.08)", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 8, color: "#111827" }}>
                  {t("taskStatus", status)} ({items.length})
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{t("home", "noTasks")}</div>
                  )}
                  {items.map((task) => {
                    const assignee = task.assigned_user_id ? profileById[task.assigned_user_id] : undefined;
                    const dueLabel = task.due_date ? new Date(task.due_date).toLocaleDateString() : "—";
                    return (
                      <Link
                        key={task.id}
                        href={`/task/${task.id}`}
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          background: "#fff",
                          border: "1px solid rgba(17,24,39,0.10)",
                          borderRadius: 10,
                          padding: 10,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{task.title}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#374151" }}>
                          <span style={{ padding: "2px 6px", borderRadius: 999, background: "rgba(17,24,39,0.06)", fontWeight: 700 }}>
                            {t("taskPriority", task.priority, task.priority)}
                          </span>
                          <span>{t("taskDrawer", "dueDate")}: {dueLabel}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
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
      </main>
    </>
  );
}
