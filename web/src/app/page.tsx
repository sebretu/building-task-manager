"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
};

const QUICK_USERS = [
  { email: "admin@demo.local", label: "admin" },
  { email: "mod@demo.local", label: "mod" },
  { email: "user@demo.local", label: "user" },
];

export default function Home() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("Password123!");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    setSessionEmail(data.session?.user?.email ?? null);
  }

  async function loadTasks() {
    setErr(null);
    const { data, error } = await supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) setErr(error.message);
    else setTasks((data ?? []) as Task[]);
  }

  useEffect(() => {
    (async () => {
      await refreshSession();
      await loadTasks();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      await refreshSession();
      await loadTasks();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setLoading(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    else setMsg("Logged in!");
    setLoading(false);
  }

  async function signOut() {
    setLoading(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase.auth.signOut();
    if (error) setErr(error.message);
    else setMsg("Logged out!");
    setLoading(false);
  }

  async function updateFirstTask() {
    if (!tasks[0]) return;
    setLoading(true);
    setMsg(null);
    setErr(null);

    const t = tasks[0];
    const { data, error } = await supabase.rpc("update_task", {
      p_task_id: t.id,
      p_title: t.title + " (EDYCJA z UI)",
      p_description: "Opis po edycji z UI",
      p_priority: "CRITICAL",
      p_due_date: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      p_assigned_user_id: "44444444-4444-4444-4444-444444444444",
      p_assigned_company_id: null,
    });

    if (error) setErr(error.message);
    else setMsg("Updated task via RPC: " + (data?.id ?? t.id));

    await loadTasks();
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Tasks</h1>

      <p>
        Session: <b>{sessionEmail ?? "(not logged in)"}</b>
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={{ padding: 8, minWidth: 260 }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          style={{ padding: 8, minWidth: 220 }}
        />
        <button onClick={signIn} disabled={loading} style={{ padding: "8px 12px" }}>
          Login
        </button>
        <button onClick={signOut} disabled={loading} style={{ padding: "8px 12px" }}>
          Logout
        </button>
        <button onClick={updateFirstTask} disabled={loading || tasks.length === 0} style={{ padding: "8px 12px" }}>
          Update first task (RPC)
        </button>
      </div>

      <p style={{ marginTop: 8 }}>
        Quick users:{" "}
        {QUICK_USERS.map((u) => (
          <button
            key={u.email}
            onClick={() => setEmail(u.email)}
            style={{ marginRight: 8, padding: "6px 10px" }}
          >
            {u.label}
          </button>
        ))}{" "}
        (Password123!)
      </p>

      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      <hr style={{ margin: "16px 0" }} />

      <ul>
        {tasks.map((t) => (
          <li key={t.id} style={{ marginBottom: 6 }}>
            <b>{t.title}</b> — {t.status} / {t.priority}
            {t.due_date ? ` (due ${t.due_date})` : ""}
            <div style={{ fontSize: 12, opacity: 0.75 }}>{t.id}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
