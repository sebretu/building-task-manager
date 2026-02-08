"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, getToken } from "@/lib/apiClient";
import PlanCompositeThumbnail from "@/components/PlanCompositeThumbnail";
import { supabase } from "@/lib/supabase";

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

function formatPlanName(rawName: string | null | undefined, level?: number) {
  const fallback = typeof level === "number" ? `Level ${level}` : "Plan";
  if (!rawName) return fallback;

  let cleaned = rawName.trim();
  cleaned = cleaned.replace(/^L\d+[\s_-]*/i, "");
  cleaned = cleaned.replace(/^Level[\s_-]*\d+[\s_-]*/i, "");
  cleaned = cleaned.replace(/[_-]+/g, " ");

  const trailingNoise = /(?:[\s_-]*(?:[0-9a-f]{8,}|[0-9]{6,}))$/i;
  let next = cleaned;
  while (trailingNoise.test(next)) {
    next = next.replace(trailingNoise, "");
  }

  cleaned = next.replace(/\s{2,}/g, " ").trim();
  return cleaned || fallback;
}

// use `getToken` and `apiGet` from lib/apiClient

export default function PlansPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const floorDisplayNames = useMemo<Record<string, string>>(
    () =>
      floors.reduce((acc, floor) => {
        acc[floor.id] = formatPlanName(floor.name, floor.level);
        return acc;
      }, {} as Record<string, string>),
    [floors]
  );

  const floorsWithPlans = useMemo(() => {
    const floorIdsWithPlans = new Set(plans.map((p) => p.floor_id));
    return floors.filter((f) => floorIdsWithPlans.has(f.id));
  }, [floors, plans]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId]
  );

  async function loadAll(pid?: string) {
    setErr(null);
    const token = await getToken();
    if (!token) {
      setErr("Brak aktywnej sesji");
      router.push("/auth/login");
      return;
    }

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

  async function handleDeletePlan(planId: string) {
    if (!planId) return;
    const confirmed = typeof window !== "undefined" ? window.confirm("Usunąć plan oraz kafelki?") : false;
    if (!confirmed) return;

    setErr(null);
    setDeletingPlanId(planId);
    try {
      const token = await getToken();
      if (!token) {
        setErr("Brak aktywnej sesji");
        router.push("/auth/login");
        return;
      }
      await apiDelete(`/api/plans?id=${encodeURIComponent(planId)}`, token);
      await loadAll(projectId || undefined);
    } catch (e: any) {
      setErr(e?.message || "Nie udało się usunąć planu");
    } finally {
      setDeletingPlanId(null);
    }
  }

  useEffect(() => {
    let isMounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        if (!data?.session) {
          router.replace("/auth/login");
          return;
        }
        setSessionChecked(true);
      })
      .catch(() => {
        if (!isMounted) return;
        router.replace("/auth/login");
      });
    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked) return;
    loadAll().catch((e: any) => {
      const message = e?.message || "Nie udało się załadować planów";
      setErr(message);
      if (typeof message === "string" && message.toLowerCase().includes("token")) {
        router.push("/auth/login");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, router]);

  if (!sessionChecked) {
    return <div style={{ padding: 32 }}>Ładowanie...</div>;
  }

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
              {floorsWithPlans.length === 0 && <div className="plans-empty">No floors with current plans</div>}
              {floorsWithPlans.length > 0 && (
                <ul className="plans-list">
                  {floorsWithPlans.map((f) => (
                    <li key={f.id}>
                      <span>{floorDisplayNames[f.id] || formatPlanName(f.name, f.level)}</span>
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
                  {plans.map((p) => {
                    const planTitle = floorDisplayNames[p.floor_id] || `Plan v${p.version}`;
                    return (
                      <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 18, width: 520, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", boxShadow: "0 2px 12px #0001", marginBottom: 24 }}>
                        <PlanCompositeThumbnail planId={p.id} size={480} alt={`Plan ${planTitle}`} />
                        <div style={{ marginTop: 14, fontWeight: 600, fontSize: 20, textAlign: "center" }}>{planTitle}</div>
                        <div style={{ marginTop: 8, fontSize: 15, color: "#666" }}>
                          v{p.version} <span style={{ color: "#888", fontWeight: 400 }}>({p.status})</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                          <Link href={`/plan/${p.id}`} className="plans-link" style={{ fontSize: 16, color: "#1976d2", textDecoration: "underline" }}>
                            Open viewer
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeletePlan(p.id)}
                            disabled={deletingPlanId === p.id}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 6,
                              border: "1px solid #d32f2f",
                              background: deletingPlanId === p.id ? "#f9d6d5" : "#fff5f5",
                              color: "#c62828",
                              fontSize: 14,
                              cursor: deletingPlanId === p.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {deletingPlanId === p.id ? "Deleting..." : "Delete plan"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
