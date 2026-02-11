"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string };
type Building = { id: string; name: string };
type Floor = { id: string; name: string; level: number | null; building_id: string };

export default function PlansUploadPage() {
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creatingFloor, setCreatingFloor] = useState(false);
  const [newFloorLevel, setNewFloorLevel] = useState("");
  const [newFloorName, setNewFloorName] = useState("");
  const { t } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  const router = useRouter();

  const handleAuthRedirect = useCallback((message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("bearer token") || msg.includes("auth_required") || msg.includes("auth invalid")) {
      router.replace("/auth/login");
      return true;
    }
    return false;
  }, [router]);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // UI state for editing project/floor names
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [editingBuilding, setEditingBuilding] = useState<string | null>(null);
  const [editingBuildingName, setEditingBuildingName] = useState("");
  const [editingFloor, setEditingFloor] = useState<string | null>(null);
  const [editingFloorName, setEditingFloorName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [newBuildingName, setNewBuildingName] = useState("");
  const [creatingBuilding, setCreatingBuilding] = useState(false);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile);
      } else {
        setErr(t("planUpload", "invalidFile", "Please upload a PDF file."));
      }
    }
  }, [t]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // ... (Keep existing save functions: saveProjectNameEdit, saveBuildingNameEdit, saveFloorNameEdit) ...
  async function saveProjectNameEdit() {
    if (!editingProject || !editingProjectName.trim()) return;
    setSavingEdit(true);
    setErr(null);
    try {
      const token = await getToken();
      await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: editingProject, name: editingProjectName.trim() }),
      });
      setProjects((prev) => prev.map((p) => p.id === editingProject ? { ...p, name: editingProjectName.trim() } : p));
      setEditingProject(null);
      setEditingProjectName("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function saveBuildingNameEdit() {
    if (!editingBuilding || !editingBuildingName.trim()) return;
    setSavingEdit(true);
    setErr(null);
    try {
      const token = await getToken();
      await fetch("/api/buildings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: editingBuilding, name: editingBuildingName.trim() }),
      });
      setBuildings((prev) => prev.map((b) => b.id === editingBuilding ? { ...b, name: editingBuildingName.trim() } : b));
      setEditingBuilding(null);
      setEditingBuildingName("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function saveFloorNameEdit() {
    if (!editingFloor || !editingFloorName.trim()) return;
    setSavingEdit(true);
    setErr(null);
    try {
      const token = await getToken();
      await fetch("/api/floors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: editingFloor, name: editingFloorName.trim() }),
      });
      setFloors((prev) => prev.map((f) => f.id === editingFloor ? { ...f, name: editingFloorName.trim() } : f));
      setEditingFloor(null);
      setEditingFloorName("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  // Local preview of the chosen PDF before upload
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setLocalPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const normalizedRole = (viewerProfile?.role || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";

  const canSubmit = useMemo(() => {
    return isAdmin && !!file && !!projectId && !!buildingId && !!floorId;
  }, [isAdmin, file, projectId, buildingId, floorId]);

  // ... (Keep existing useEffects for session, projects, buildings, floors) ...
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data?.session) {
          router.replace("/auth/login");
          return;
        }

        const authId = data.session.user.id;
        (async () => {
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, role")
              .eq("id", authId)
              .single();

            if (!active) return;
            setViewerProfile(profile || null);
          } catch {
            if (!active) return;
            setViewerProfile(null);
          } finally {
            if (!active) return;
            setSessionChecked(true);
          }
        })();
      })
      .catch(() => {
        if (!active) return;
        router.replace("/auth/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked || !isAdmin) return;

    let active = true;
    setProjectsLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          handleAuthRedirect("Missing Bearer token");
          return;
        }
        const ps = await apiGet<Project[]>("/api/projects", token);
        if (!active) return;
        setProjects(ps);
        if (ps.length > 0 && !projectId) {
          setProjectId(ps[0].id);
        }
      } catch (error: any) {
        if (!active) return;
        const message = error?.message || String(error);
        if (handleAuthRedirect(message)) return;
        setErr(message);
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, isAdmin]);

  // Fetch buildings when project changes
  useEffect(() => {
    if (!projectId || !sessionChecked || !isAdmin) return;

    let active = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          handleAuthRedirect("Missing Bearer token");
          return;
        }
        const bs = await apiGet<Building[]>(`/api/buildings?projectId=${encodeURIComponent(projectId)}`, token);
        if (!active) return;
        setBuildings(bs);
        if (bs.length === 0) {
          setBuildingId("");
        } else if (!bs.find((b) => b.id === buildingId)) {
          setBuildingId(bs[0].id);
        }
      } catch (error: any) {
        if (!active) return;
        const message = error?.message || String(error);
        if (handleAuthRedirect(message)) return;
        setErr(message);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, handleAuthRedirect, sessionChecked, isAdmin]);

  // Fetch floors when building (or project) changes
  useEffect(() => {
    if (!projectId || !sessionChecked || !isAdmin) {
      return;
    }

    let active = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          handleAuthRedirect("Missing Bearer token");
          return;
        }

        const fs = await apiGet<Floor[]>(`/api/floors?projectId=${encodeURIComponent(projectId)}`, token);
        if (!active) return;

        // Filter floors by buildingId if we have one
        const relevantFloors = buildingId ? fs.filter(f => f.building_id === buildingId) : [];

        setFloors(relevantFloors);
        if (relevantFloors.length === 0) {
          setFloorId("");
        } else if (!relevantFloors.find((f) => f.id === floorId)) {
          setFloorId(relevantFloors[0].id);
        }
      } catch (error: any) {
        if (!active) return;
        const message = error?.message || String(error);
        if (handleAuthRedirect(message)) return;
        setErr(message);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, buildingId, handleAuthRedirect, sessionChecked, isAdmin]);

  async function createBuilding() {
    setErr(null);
    setOk(null);

    if (!isAdmin) {
      setErr(t("planUpload", "adminOnlyBody", "Only admins can upload plans."));
      return;
    }

    if (!projectId) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    const trimmedName = newBuildingName.trim();
    if (!trimmedName) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    setCreatingBuilding(true);
    try {
      const token = await getToken();
      const created = await apiPost<Building>("/api/buildings", {
        project_id: projectId, // API expects project_id
        name: trimmedName,
      });

      setBuildings((prev) => {
        if (prev.some((b) => b.id === created.id)) {
          return prev;
        }
        const next = [...prev, created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setBuildingId(created.id);
      setNewBuildingName("");
    } catch (error: any) {
      const message = error?.message || String(error);
      if (handleAuthRedirect(message)) return;
      setErr(message);
    } finally {
      setCreatingBuilding(false);
    }
  }

  async function createFloor() {
    setErr(null);
    setOk(null);

    if (!isAdmin) {
      setErr(t("planUpload", "adminOnlyBody", "Only admins can upload plans."));
      return;
    }

    if (!projectId) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    const trimmedName = newFloorName.trim();
    if (!trimmedName) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    const rawLevel = newFloorLevel.trim();
    const parsedLevel = rawLevel === "" ? null : Number(rawLevel);
    if (rawLevel !== "" && !Number.isFinite(parsedLevel)) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    setCreatingFloor(true);
    try {
      const created = await apiPost<Floor>("/api/floors", {
        projectId,
        buildingId, // Pass buildingId
        name: trimmedName,
        level: parsedLevel,
      });

      setFloors((prev) => {
        const next = [...prev.filter((f) => f.id !== created.id), created];
        next.sort((a, b) => {
          const aLevel = typeof a.level === "number" ? a.level : Number.MAX_SAFE_INTEGER;
          const bLevel = typeof b.level === "number" ? b.level : Number.MAX_SAFE_INTEGER;
          if (aLevel === bLevel) {
            return a.name.localeCompare(b.name);
          }
          return aLevel - bLevel;
        });
        return next;
      });
      setFloorId(created.id);
      setNewFloorName("");
      setNewFloorLevel("");
    } catch (error: any) {
      const message = error?.message || String(error);
      if (handleAuthRedirect(message)) return;
      setErr(message);
    } finally {
      setCreatingFloor(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!isAdmin) {
      setErr(t("planUpload", "adminOnlyBody", "Only admins can upload plans."));
      return;
    }

    if (!file) {
      setErr(t("planUpload", "errorMissingFile", "Select a PDF file."));
      return;
    }

    if (!projectId || !floorId) {
      setErr(t("planUpload", "errorMissingFields", "Fill in all fields."));
      return;
    }

    setBusy(true);
    try {
      const token = await getToken();
      if (!token) {
        handleAuthRedirect("Missing Bearer token");
        return;
      }

      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("floorId", floorId);
      fd.append("file", file); // field must be named "file"

      const r = await fetch("/api/plans/upload", {
        method: "POST",
        body: fd,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const j = await r.json().catch(() => null);

      if (r.status === 401) {
        handleAuthRedirect("Missing Bearer token");
        return;
      }

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || j?.error?.message || `Upload failed (${r.status})`);
      }

      const planId = j?.data?.id as string | undefined;
      setOk(`${t("planUpload", "success", "Plan uploaded successfully.")} ${planId ? `(${planId})` : ""}`.trim());

      // Optional: don't clear file to allow multiple uploads for different floors? 
      // User style guide usually prefers clear after success.
      // But let's stick to what we had: clear file.
      if (planId) {
        router.push(`/plan/${planId}`);
      }
      setFile(null);
    } catch (error: any) {
      const message = error?.message || String(error);
      if (handleAuthRedirect(message)) return;
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  if (!sessionChecked) {
    return <div style={{ padding: 48, textAlign: "center", color: "var(--home-muted)" }}>Ładowanie...</div>;
  }

  if (!isAdmin) {
    return (
      <main className="home-main upload-main">
        <section className="home-task-panel upload-panel" style={{ textAlign: "center", padding: "64px 24px" }}>
          <div>
            <h2 style={{ fontSize: 24, marginBottom: 16 }}>{t("planUpload", "adminOnlyTitle", "Upload restricted")}</h2>
            <p style={{ color: "var(--home-muted)", marginBottom: 24 }}>{t("planUpload", "adminOnlyBody", "Only admins can upload plans.")}</p>
            <Link href="/plans" className="upload-btn-primary">
              {t("planUpload", "back", "Back to plans")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="home-main upload-main">
      <section className="upload-panel">
        <div className="upload-header-centered">
          <div>
            <div className="home-hero-kicker">{t("planUpload", "kicker", "Upload")}</div>
            <h2>{t("planUpload", "title", "Upload plan (PDF)")}</h2>
            <p>
              {t(
                "planUpload",
                "subtitle",
                "Select the project and floor, attach the PDF, and we will version it automatically."
              )}
            </p>
          </div>
          <div style={{ marginTop: 16 }}>
            <Link href="/plans" className="upload-btn-secondary">
              {t("planUpload", "back", "Back to plans")}
            </Link>
          </div>
        </div>

        <div className="upload-grid">
          <form onSubmit={onSubmit} className="upload-card">
            {/* Project Section */}
            <div className="upload-section">
              <div className="upload-section-header">
                <span className="upload-section-title">{t("planUpload", "projectName", "Project")}</span>
              </div>
              <div className="upload-field">
                <div className="upload-input-group">
                  <select
                    className="upload-select"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {projects.length === 0 && <option value="">{projectsLoading ? "Loading..." : t("planUpload", "projectName", "Select Project")}</option>}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {projectId && (
                  <div style={{ marginTop: 8 }}>
                    {editingProject === projectId ? (
                      <div className="upload-input-group">
                        <input
                          className="upload-input"
                          value={editingProjectName}
                          onChange={(e) => setEditingProjectName(e.target.value)}
                          disabled={savingEdit}
                          placeholder="Project name"
                        />
                        <button
                          type="button"
                          onClick={saveProjectNameEdit}
                          disabled={savingEdit || !editingProjectName.trim()}
                          className="upload-btn-primary"
                          style={{ padding: "8px 16px", fontSize: 13 }}
                        >
                          {t("planUpload", "save", "Save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingProject(null); setEditingProjectName(""); }}
                          disabled={savingEdit}
                          className="upload-btn-secondary"
                        >
                          {t("planUpload", "cancel", "Cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const p = projects.find((p) => p.id === projectId);
                          setEditingProject(projectId);
                          setEditingProjectName(p?.name || "");
                        }}
                        className="upload-btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        {t("planUpload", "edit", "Edit Name")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Building Section */}
            <div className="upload-section">
              <div className="upload-section-header">
                <span className="upload-section-title">{t("planUpload", "buildingName", "Building")}</span>
              </div>

              {buildings.length === 0 && projectId && (
                <div style={{ fontSize: 13, color: "var(--home-muted)", marginBottom: 12 }}>
                  {t("planUpload", "noBuildings", "No buildings found. Add one below.")}
                </div>
              )}

              <div className="upload-field">
                <select
                  className="upload-select"
                  value={buildingId}
                  onChange={(e) => setBuildingId(e.target.value)}
                  disabled={buildings.length === 0}
                >
                  {buildings.length === 0 && <option value="">{t("planUpload", "buildingName", "Select Building")}</option>}
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {buildingId && (
                  <div style={{ marginTop: 8 }}>
                    {editingBuilding === buildingId ? (
                      <div className="upload-input-group">
                        <input
                          className="upload-input"
                          value={editingBuildingName}
                          onChange={(e) => setEditingBuildingName(e.target.value)}
                          disabled={savingEdit}
                        />
                        <button
                          type="button"
                          onClick={saveBuildingNameEdit}
                          disabled={savingEdit || !editingBuildingName.trim()}
                          className="upload-btn-primary"
                          style={{ padding: "8px 16px", fontSize: 13 }}
                        >
                          {t("planUpload", "save", "Save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingBuilding(null); setEditingBuildingName(""); }}
                          disabled={savingEdit}
                          className="upload-btn-secondary"
                        >
                          {t("planUpload", "cancel", "Cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const b = buildings.find((b) => b.id === buildingId);
                          setEditingBuilding(buildingId);
                          setEditingBuildingName(b?.name || "");
                        }}
                        className="upload-btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        {t("planUpload", "edit", "Edit Name")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="upload-input-group">
                  <input
                    className="upload-input"
                    value={newBuildingName}
                    onChange={(e) => setNewBuildingName(e.target.value)}
                    placeholder={t("planUpload", "newBuildingName", "New building name")}
                  />
                  <button
                    type="button"
                    onClick={createBuilding}
                    disabled={!projectId || !newBuildingName.trim() || creatingBuilding}
                    className="upload-btn-secondary"
                  >
                    {creatingBuilding ? "..." : "+"}
                  </button>
                </div>
              </div>
            </div>

            {/* Floor Section */}
            <div className="upload-section">
              <div className="upload-section-header">
                <span className="upload-section-title">{t("planUpload", "floorName", "Floor")}</span>
              </div>

              <div className="upload-field">
                <select
                  className="upload-select"
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                  disabled={floors.length === 0}
                >
                  {floors.length === 0 && <option value="">{t("planUpload", "floorName", "Select Floor")}</option>}
                  {floors.map((f) => {
                    const levelLabel = typeof f.level === "number" ? `L${f.level}` : "?";
                    return (
                      <option key={f.id} value={f.id}>
                        {levelLabel} — {f.name}
                      </option>
                    );
                  })}
                </select>

                {floorId && (
                  <div style={{ marginTop: 8 }}>
                    {editingFloor === floorId ? (
                      <div className="upload-input-group">
                        <input
                          className="upload-input"
                          value={editingFloorName}
                          onChange={(e) => setEditingFloorName(e.target.value)}
                          disabled={savingEdit}
                        />
                        <button
                          type="button"
                          onClick={saveFloorNameEdit}
                          disabled={savingEdit || !editingFloorName.trim()}
                          className="upload-btn-primary"
                          style={{ padding: "8px 16px", fontSize: 13 }}
                        >
                          {t("planUpload", "save", "Save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingFloor(null); setEditingFloorName(""); }}
                          disabled={savingEdit}
                          className="upload-btn-secondary"
                        >
                          {t("planUpload", "cancel", "Cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const f = floors.find((f) => f.id === floorId);
                          setEditingFloor(floorId);
                          setEditingFloorName(f?.name || "");
                        }}
                        className="upload-btn-secondary"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        {t("planUpload", "edit", "Edit Name")}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>Add New Floor</div>
                <div className="upload-input-group">
                  <input
                    className="upload-input"
                    value={newFloorName}
                    onChange={(e) => setNewFloorName(e.target.value)}
                    placeholder={t("planUpload", "newFloorName", "Floor Name")}
                  />
                  <input
                    type="number"
                    className="upload-input"
                    value={newFloorLevel}
                    onChange={(e) => setNewFloorLevel(e.target.value)}
                    placeholder="Lvl"
                    style={{ width: "80px" }}
                  />
                  <button
                    type="button"
                    onClick={createFloor}
                    disabled={!projectId || !buildingId || !newFloorName.trim() || creatingFloor}
                    className="upload-btn-secondary"
                  >
                    {creatingFloor ? "..." : "+"}
                  </button>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="upload-section">
              <div className="upload-section-header">
                <span className="upload-section-title">{t("planUpload", "file", "PDF File")}</span>
              </div>

              {!file ? (
                <div
                  className={`upload-zone ${dragActive ? "drag-active" : ""}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-upload")?.click()}
                >
                  <div className="upload-zone-icon">📄</div>
                  <div className="upload-zone-text">{t("planUpload", "clickOrDrag", "Click to upload or drag and drop")}</div>
                  <div className="upload-zone-sub">PDF (max 20MB)</div>
                  <input
                    id="file-upload"
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />
                </div>
              ) : (
                <div className="upload-file-card">
                  <div className="upload-file-icon">📄</div>
                  <div className="upload-file-info">
                    <div className="upload-file-name">{file.name}</div>
                    <div className="upload-file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <button
                    type="button"
                    className="upload-file-remove"
                    onClick={() => setFile(null)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                type="submit"
                disabled={!canSubmit || busy}
                className="upload-btn-primary"
                style={{ width: "100%", padding: "16px" }}
              >
                {busy ? t("planUpload", "submitting", "Uploading...") : t("planUpload", "submit", "Upload Plan")}
              </button>
            </div>

            {err && (
              <div className="upload-alert upload-alert-error">
                <span>⚠️</span>
                <span>{err}</span>
              </div>
            )}

            {ok && (
              <div className="upload-alert upload-alert-success">
                <span>✅</span>
                <span>{ok}</span>
              </div>
            )}

            <div className="upload-tip" style={{ textAlign: "center" }}>
              {t(
                "planUpload",
                "tip",
                "Versions increase automatically—pick the project and floor, then drop the PDF."
              )}
            </div>
          </form>

          <div className="upload-preview">
            {!localPdfUrl ? (
              <div className="upload-empty-state">
                <div className="upload-empty-icon">👁️</div>
                <div>{t("planUpload", "emptyPreview", "Preview will appear here")}</div>
              </div>
            ) : (
              <iframe src={localPdfUrl} title="PDF preview" />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
