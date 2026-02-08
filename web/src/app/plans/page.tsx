"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, getToken } from "@/lib/apiClient";
import PlanCompositeThumbnail from "@/components/PlanCompositeThumbnail";

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

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

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
    <>
      <div className="home-hero plans-hero">
        <section className="home-hero-content plans-hero-content">
          <div className="home-hero-text">
            <div className="home-hero-kicker">Plans</div>
            <h1 className="home-hero-title">Project plans and floors</h1>
            <p className="home-hero-subtitle">
              Manage current drawings, track floor levels, and open the live viewer for any plan.
            </p>
            <div className="home-hero-actions">
              <Link href="/" className="home-hero-secondary">
                Back to tasks
              </Link>
            </div>
          </div>
          <div className="home-hero-media plans-hero-media">
            <div className="plans-hero-overview">
              <span className="plans-hero-label">Current overview</span>
              <h3 className="plans-hero-project">{selectedProject?.name || "Select a project"}</h3>
              <div className="plans-hero-stats">
                <span>{projects.length} projects</span>
                <span>{floors.length} floors</span>
                <span>{plans.length} plans</span>
              </div>
            </div>
            <div className="home-hero-grid" />
          </div>
        </section>
      </div>

      <main className="home-main plans-main">
        {err && <div className="home-card-error plans-error">{err}</div>}
        <section className="home-task-panel plans-panel">
          <div className="home-section-header">
            <h2>Plans library</h2>
            <p>Switch project, review floors, and open the current plan set.</p>
          </div>

          <div className="plans-grid">
            <div className="plans-card">
              <div className="plans-card-title">Project</div>
              <label className="plans-label">
                Select project
                <select value={projectId} onChange={(e) => loadAll(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="plans-card">
              <div className="plans-card-title">Floors</div>
              {floors.length === 0 && <div className="plans-empty">No floors</div>}
              {floors.length > 0 && (
                <ul className="plans-list">
                  {floors.map((f) => (
                    <li key={f.id}>
                      <span className="plans-pill">L{f.level}</span>
                      <span>{f.name}</span>
                      <span className="plans-muted">{f.id.slice(0, 8)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="plans-card">
              <div className="plans-card-title">Current plans</div>
              {plans.length === 0 && <div className="plans-empty">No current plans</div>}
              {plans.length > 0 && (
                <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
                  {plans.map((p) => (
                    <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 18, width: 520, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", boxShadow: "0 2px 12px #0001", marginBottom: 24 }}>
                      <PlanCompositeThumbnail planId={p.id} size={480} alt={`Plan ${p.id}`} />
                      <div style={{ marginTop: 14, fontWeight: 600, fontSize: 18 }}>v{p.version} <span style={{ color: "#888", fontWeight: 400 }}>({p.status})</span></div>
                      <div style={{ fontSize: 15, color: "#666", marginBottom: 6 }}>Floor: {p.floor_id.slice(0, 8)}</div>
                      <Link href={`/plan/${p.id}`} className="plans-link" style={{ marginTop: 10, fontSize: 16, color: "#1976d2", textDecoration: "underline" }}>
                        Open viewer
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
