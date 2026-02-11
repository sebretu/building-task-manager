"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, getToken } from "@/lib/apiClient";
import PlanCompositeThumbnail from "@/components/PlanCompositeThumbnail";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";

type Project = { id: string; name: string };
type Building = { id: string; name: string };

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
  const router = useRouter();
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null; company_id: string | null } | null>(null);

  const normalizedRole = (viewerProfile?.role || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === projectId);
  }, [projects, projectId]);

  async function loadAll(pid?: string) {
    setErr(null);
    const token = await getToken();
    if (!token) {
      setErr(t("plansPage", "sessionMissing", "Missing active session."));
      router.push("/auth/login");
      return;
    }

    const ps = await apiGet<Project[]>("/api/projects", token);
    setProjects(ps);

    const usePid = pid || projectId || ps[0]?.id;
    if (!usePid) {
      setProjectId("");
      setBuildings([]);
      setFloors([]);
      setPlans([]);
      return;
    }
    setProjectId(usePid);

    // Run fetches in parallel for speed
    const [bs, fs, pls] = await Promise.all([
      apiGet<Building[]>(`/api/buildings?projectId=${encodeURIComponent(usePid)}`, token),
      apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(usePid)}`, token),
      apiGet<Plan[]>(`/api/plans?projectId=${encodeURIComponent(usePid)}&current=true`, token)
    ]);

    setBuildings(bs);
    setFloors(fs);
    setPlans(pls);
  }

  async function handleDeletePlan(planId: string) {
    if (!planId || !isAdmin) return;
    const confirmMessage = t("plansPage", "deletePlanConfirm", "Delete plan and tiles?");
    const confirmed = typeof window !== "undefined" ? window.confirm(confirmMessage) : false;
    if (!confirmed) return;

    setErr(null);
    setDeletingPlanId(planId);
    try {
      const token = await getToken();
      if (!token) {
        setErr(t("plansPage", "sessionMissing", "Missing active session."));
        router.push("/auth/login");
        return;
      }
      await apiDelete(`/api/plans?id=${encodeURIComponent(planId)}`, token);
      await loadAll(projectId || undefined);
    } catch (e: any) {
      const fallback = t("plansPage", "deletePlanError", "Failed to delete plan.");
      setErr(e?.message || fallback);
    } finally {
      setDeletingPlanId(null);
    }
  }

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!data?.session) {
          router.replace("/auth/login");
          return;
        }

        const authId = data.session.user.id;

        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, role, company_id")
            .eq("id", authId)
            .single();

          if (!isMounted) return;
          setViewerProfile(profile || null);
        } catch {
          if (!isMounted) return;
          setViewerProfile(null);
        } finally {
          if (!isMounted) return;
          setSessionChecked(true);
        }
      } catch {
        if (!isMounted) return;
        router.replace("/auth/login");
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked) return;
    loadAll().catch((e: any) => {
      const fallback = t("plansPage", "loadError", "Failed to load plans.");
      const message = e?.message || fallback;
      setErr(message);
      if (typeof message === "string" && message.toLowerCase().includes("token")) {
        router.push("/auth/login");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, router]);

  if (!sessionChecked) {
    return <div style={{ padding: 48, textAlign: "center", color: "var(--home-muted)" }}>{t("plansPage", "pageLoading", "Loading plans...")}</div>;
  }

  return (
    <main className="home-main upload-main">
      {err && <div className="home-card-error plans-error">{err}</div>}
      <section className="upload-panel">
        <div className="upload-header-centered">
          <div>
            <div className="home-hero-kicker">{t("plansPage", "kicker", "Library")}</div>
            <h2>{t("plansPage", "title", "Plans library")}</h2>
            <p>{t("plansPage", "subtitle", "Review and manage your project plans.")}</p>
          </div>
          <div style={{ marginTop: 16 }}>
            {/* Optional extra action buttons could go here */}
          </div>
        </div>

        <div className="upload-grid">
          {/* Project Selection Card */}
          <div className="upload-card">
            <div className="upload-section">
              <div className="upload-section-header">
                <span className="upload-section-title">{t("plansPage", "projectCardTitle", "Project")}</span>
              </div>
              <div className="upload-field">
                <div className="upload-input-group">
                  <select
                    className="upload-select"
                    value={projectId}
                    onChange={(e) => loadAll(e.target.value)}
                    disabled={projects.length === 0}
                  >
                    {projects.length === 0 && (
                      <option value="">{t("plansPage", "projectSelectPlaceholder", "-- Select project --")}</option>
                    )}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="plans-display-grid" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 24, marginTop: 24 }}>
            {plans.length === 0 && (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 48, color: "var(--home-muted)" }}>
                {t("plansPage", "noPlans", "No current plans")}
              </div>
            )}
            {plans.map((p) => {
              const floor = floors.find(f => f.id === p.floor_id);
              const building = buildings.find(b => b.id === floor?.building_id);
              const project = projects.find(proj => proj.id === p.project_id);

              const locationParts = [
                project?.name,
                building?.name,
                floor?.name
              ].filter(Boolean);

              const locationString = locationParts.join(" - ");

              return (
                <div key={p.id} className="upload-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <Link href={`/plan/${p.id}`} style={{ padding: 24, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", color: "inherit", cursor: "pointer" }}>
                    <PlanCompositeThumbnail
                      planId={p.id}
                      size={280}
                      alt={locationString || "Plan"}
                    />
                    <div style={{ marginTop: 16, fontWeight: 600, fontSize: 16, textAlign: "center", color: "var(--home-foreground)" }}>
                      {locationString || `Plan v${p.version}`}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "var(--home-muted)" }}>
                      v{p.version} ({p.status})
                    </div>
                  </Link>
                  <div style={{ borderTop: "1px solid var(--border)", padding: 12, display: "flex", justifyContent: "flex-end", alignItems: "center", background: "var(--home-bg-secondary)" }}>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeletePlan(p.id)}
                        disabled={deletingPlanId === p.id}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--danger)",
                          fontSize: 13,
                          cursor: deletingPlanId === p.id ? "not-allowed" : "pointer",
                          opacity: deletingPlanId === p.id ? 0.5 : 1
                        }}
                      >
                        {deletingPlanId === p.id ? "..." : t("plansPage", "deletePlan", "Delete")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
