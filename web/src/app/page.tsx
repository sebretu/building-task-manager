"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
};

export default function Home() {
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("Password123!");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    setErr(null);

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
  }

  useEffect(() => {
    loadAll().catch((e) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, offset, statusFilter, projectId, qDebounced]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main style={{ padding: 24 }}>
      <h1>Tasks</h1>

      <div style={{ marginBottom: 12, display: "flex", gap: "20px" }}>
        <Link href="/plans" style={{ textDecoration: "none" }}>
          → Plans
        </Link>
        <Link href="/users" style={{ textDecoration: "none" }}>
          → Users
        </Link>
        <Link href="/companies" style={{ textDecoration: "none" }}>
          → Companies
        </Link>
      </div>

      {err && (
        <div style={{ marginBottom: 12, color: "crimson" }}>
          {err}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label>
          Project:{" "}
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
          placeholder="Search…"
          style={{ width: 280 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button
          onClick={async () => {
            try {
              await supabase.auth.signInWithPassword({ email, password });
              await loadAll();
            } catch (e: any) {
              setErr(String(e?.message || e));
            }
          }}
        >
          Sign in
        </button>
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
  );
}
