"use client";

import { useEffect, useState } from "react";
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
  priority: string;
  due_date: string | null;
};

type User = {
  id: string;
  email: string;
  full_name: string;
};

export default function Home() {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

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
      const qQ = qDebounced ? `&q=${encodeURIComponent(qDebounced)}` : "";

      const ts = await apiGet<Task[]>(
        `/api/tasks?projectId=${encodeURIComponent(pid)}&limit=${limit}&offset=${offset}${statusQ}${qQ}`
      );
      setTasks(ts);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    if (!sessionLoaded) return;
    loadAll().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, statusFilter, projectId, qDebounced, sessionLoaded]);

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
            {s ?? "ALL"}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          disabled={offset === 0}
          style={{ marginRight: 8 }}
        >
          Prev
        </button>
        <button onClick={() => setOffset((o) => o + limit)} style={{ marginRight: 8 }}>
          Next
        </button>
        <label style={{ marginLeft: 12 }}>
          Limit:{" "}
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

      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={`/task/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              [{t.status}] {t.title}
            </Link>
          </li>
        ))}
      </ul>
      </main>
    </>
  );
}
