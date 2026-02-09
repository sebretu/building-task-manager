"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost, getToken } from "@/lib/apiClient";
import PlanCompositeThumbnail from "@/components/PlanCompositeThumbnail";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectDeletingId, setProjectDeletingId] = useState<string | null>(null);
  const [projectFormError, setProjectFormError] = useState<string | null>(null);

  const normalizedRole = (viewerProfile?.role || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";

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
      setErr(t("plansPage", "sessionMissing", "Missing active session."));
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

  async function handleCreateProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setProjectFormError(t("plansPage", "projectNameRequired", "Provide a project name."));
      return;
    }

    try {
      setProjectSaving(true);
      setProjectFormError(null);
      await apiPost("/api/projects", { name: trimmed });
      setNewProjectName("");
      await loadAll();
    } catch (error: any) {
      const fallback = t("plansPage", "projectCreateError", "Failed to create project.");
      setProjectFormError(error?.message || fallback);
    } finally {
      setProjectSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!isAdmin || !selectedProject) return;
    const confirmMessage = t("plansPage", "deleteProjectConfirm", "Delete project {name}?").replace(
      "{name}",
      selectedProject.name
    );
    const confirmed = typeof window !== "undefined" ? window.confirm(confirmMessage) : false;
    if (!confirmed) return;

    try {
      setProjectDeletingId(selectedProject.id);
      setProjectFormError(null);
      await apiDelete(`/api/projects?id=${encodeURIComponent(selectedProject.id)}`);
      setProjectId("");
      await loadAll();
    } catch (error: any) {
      const fallback = t("plansPage", "deleteProjectError", "Failed to delete project.");
      setProjectFormError(error?.message || fallback);
    } finally {
      setProjectDeletingId(null);
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

        const authId = data.session.user.id;
        supabase
          .from("profiles")
          .select("id, role")
          .eq("id", authId)
          .single()
          .then(({ data: profile }) => {
            if (!isMounted) return;
            setViewerProfile(profile || null);
            setSessionChecked(true);
          })
          .catch(() => {
            if (!isMounted) return;
            setViewerProfile(null);
            setSessionChecked(true);
          });
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
    return <div style={{ padding: 32 }}>{t("plansPage", "pageLoading", "Loading plans...")}</div>;
  }

  return (
    <main className="home-main plans-main">
        {err && <div className="home-card-error plans-error">{err}</div>}
        <section className="home-task-panel plans-panel">
          <div className="home-section-header">
            <h2>{t("plansPage", "title", "Plans library")}</h2>
            <p>{t("plansPage", "subtitle", "Switch project, review floors, and open the current plan set.")}</p>
          </div>

          <div className="plans-grid">
            <div className="plans-card">
              <div className="plans-card-title">{t("plansPage", "projectCardTitle", "Project")}</div>
              <label className="plans-label">
                {t("plansPage", "projectLabel", "Select project")}
                <select value={projectId} onChange={(e) => loadAll(e.target.value)} disabled={projects.length === 0}>
                  {projects.length === 0 && (
                    <option value="">{t("plansPage", "projectSelectPlaceholder", "-- Select project --")}</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin && (
                <div style={{ marginTop: 16 }}>
                  <form onSubmit={handleCreateProject} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="plans-card-title" style={{ fontSize: 16 }}>
                      {t("plansPage", "createProjectTitle", "Add project")}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder={t("plansPage", "newProjectPlaceholder", "Project name")}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                      <button
                        type="submit"
                        disabled={projectSaving}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 6,
                          border: "none",
                          background: "#1e88e5",
                          color: "#fff",
                          fontWeight: 600,
                          cursor: projectSaving ? "not-allowed" : "pointer",
                        }}
                      >
                        {projectSaving
                          ? t("plansPage", "addingProject", "Adding...")
                          : t("plansPage", "addProjectButton", "Add project")}
                      </button>
                    </div>
                  </form>
                  {selectedProject && (
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      disabled={projectDeletingId === selectedProject.id}
                      style={{
                        marginTop: 12,
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid #c62828",
                        background: projectDeletingId === selectedProject.id ? "#f9d6d5" : "#fff5f5",
                        color: "#c62828",
                        fontWeight: 600,
                        cursor: projectDeletingId === selectedProject.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {projectDeletingId === selectedProject.id
                        ? t("plansPage", "deletingProject", "Deleting...")
                        : t("plansPage", "deleteProjectButton", "Delete project")}
                    </button>
                  )}
                  {projectFormError && (
                    <div
                      style={{
                        marginTop: 12,
                        background: "#fff3cd",
                        color: "#856404",
                        padding: "8px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      {projectFormError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="plans-card">
              <div className="plans-card-title">{t("plansPage", "floorsCardTitle", "Floors")}</div>
              {floorsWithPlans.length === 0 && (
                <div className="plans-empty">{t("plansPage", "noFloors", "No floors with current plans")}</div>
              )}
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
              <div className="plans-card-title">{t("plansPage", "plansCardTitle", "Current plans")}</div>
              {plans.length === 0 && (
                <div className="plans-empty">{t("plansPage", "noPlans", "No current plans")}</div>
              )}
              {plans.length > 0 && (
                <div style={{ display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
                  {plans.map((p) => {
                    const planTitle = floorDisplayNames[p.floor_id] || `Plan v${p.version}`;
                    return (
                      <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 18, width: 520, display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", boxShadow: "0 2px 12px #0001", marginBottom: 24 }}>
                        <PlanCompositeThumbnail
                          planId={p.id}
                          size={480}
                          alt={t("plansPage", "planAlt", "Plan {name}").replace("{name}", planTitle)}
                        />
                        <div style={{ marginTop: 14, fontWeight: 600, fontSize: 20, textAlign: "center" }}>{planTitle}</div>
                        <div style={{ marginTop: 8, fontSize: 15, color: "#666" }}>
                          v{p.version} <span style={{ color: "#888", fontWeight: 400 }}>({p.status})</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                          <Link href={`/plan/${p.id}`} className="plans-link" style={{ fontSize: 16, color: "#1976d2", textDecoration: "underline" }}>
                            {t("plansPage", "openViewer", "Open viewer")}
                          </Link>
                          {isAdmin && (
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
                              {deletingPlanId === p.id
                                ? t("plansPage", "deletingPlan", "Deleting...")
                                : t("plansPage", "deletePlan", "Delete plan")}
                            </button>
                          )}
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
  );
}
