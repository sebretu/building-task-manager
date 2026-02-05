"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, getToken } from "@/lib/apiClient";

type Project = { id: string; name: string };

type Floor = {
  id: string;
  building_id: string;
  name: string;
  level: number;
};

type Plan = {
  id: string;
  project_id: string;
  floor_id: string;
  version: number;
  status: string;
  pdf_path: string;
  storage_bucket: string;
  storage_path: string | null;
  is_current: boolean;
  image_width: number | null;
  image_height: number | null;
};

// use `getToken` and `apiGet` from lib/apiClient

export default function PlansPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll(pid?: string) {
    setErr(null);
    const token = await getToken();

    const ps = await apiGet<Project[]>("/api/projects", token);
    setProjects(ps);

    const usePid = pid || projectId || ps[0]?.id;
    if (!usePid) return;
    setProjectId(usePid);

    const fs = await apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(usePid)}`, token);
    setFloors(fs);

    const pls = await apiGet<Plan[]>(
      `/api/plans?projectId=${encodeURIComponent(usePid)}&current=true`,
      token
    );
    setPlans(pls);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Plans</h1>

      <div style={{ marginBottom: 12 }}>
        <Link href="/" style={{ textDecoration: "none" }}>← Back to tasks</Link>
      </div>

      {err && <p style={{ color: "red" }}>{err}</p>}

      <div style={{ marginBottom: 12 }}>
        <label style={{ marginRight: 8 }}>Project:</label>
        <select
          value={projectId}
          onChange={(e) => loadAll(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <h3>Floors</h3>
      {floors.length === 0 && <p>No floors</p>}
      {floors.length > 0 && (
        <ul>
          {floors.map((f) => (
            <li key={f.id}>
              L{f.level} — {f.name} (id: {f.id})
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 16 }}>Current plans</h3>
      {plans.length === 0 && <p>No current plans</p>}
      {plans.length > 0 && (
        <ul>
          {plans.map((p) => (
            <li key={p.id}>
              <b>{p.status}</b> — v{p.version} — floor {p.floor_id} —{" "}
              <Link href={`/plan/${p.id}`}>Open viewer</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
