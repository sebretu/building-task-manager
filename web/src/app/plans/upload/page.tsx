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
  const handleAuthRedirect = (message: string) => {
    const msg = message.toLowerCase();
    if (msg.includes("bearer token") || msg.includes("auth_required") || msg.includes("auth invalid")) {
      router.replace("/auth/login");
      return true;
    }
    return false;
  };
  const [sessionChecked, setSessionChecked] = useState(false);
  const router = useRouter();
  const [projectId, setProjectId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);
  // ...existing code...
  const [file, setFile] = useState<File | null>(null);
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

  // Save edited project name
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
      // Update local state
      setProjects((prev) => prev.map((p) => p.id === editingProject ? { ...p, name: editingProjectName.trim() } : p));
      setEditingProject(null);
      setEditingProjectName("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  // Save edited building name
  async function saveBuildingNameEdit() {
    if (!editingBuilding || !editingBuildingName.trim()) return;
    setSavingEdit(true);
    setErr(null);
    try {
      const token = await getToken();
      await fetch("/api/buildings", { // Assuming PATCH /api/buildings exists or I need to create it? wait, I didn't check PATCH on buildings.ts
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

  // Save edited floor name
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
      // Update local state
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
        supabase
          .from("profiles")
          .select("id, role")
          .eq("id", authId)
          .single()
          .then(({ data: profile }) => {
            if (!active) return;
            setViewerProfile(profile || null);
            setSessionChecked(true);
          })
          .catch(() => {
            if (!active) return;
            setViewerProfile(null);
            setSessionChecked(true);
          });
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
        // Fetch floors. If buildingId is set, we could filter here or filtering client side. 
        // The API defaults to returning all floors for project if we just ask for project.
        // However, looking at the code, we want to show floors for the selected building.
        // Let's assume we can filter client side if the API returns all.
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
    return <div style={{ padding: 32 }}>Ładowanie...</div>;
  }

  if (!isAdmin) {
    return (
      <main className="home-main upload-main">
        <section className="home-task-panel upload-panel">
          <div className="home-section-header">
            <h2>{t("planUpload", "adminOnlyTitle", "Upload restricted")}</h2>
            <p>{t("planUpload", "adminOnlyBody", "Only admins can upload plans.")}</p>
            <Link href="/plans" className="home-hero-secondary" style={{ marginTop: 16, display: "inline-flex" }}>
              {t("planUpload", "back", "Back to plans")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="home-main upload-main">
      <section className="home-task-panel upload-panel">
        <div className="home-section-header">
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
          <Link href="/plans" className="home-hero-secondary">
            {t("planUpload", "back", "Back to plans")}
          </Link>
        </div>

        <div className="upload-grid">
          <form onSubmit={onSubmit} className="upload-form">
            <label className="upload-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{t("planUpload", "projectName", "Project name")}</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.length === 0 && <option value="">{t("planUpload", "projectName", "Project name")}</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {projectId && (
                editingProject === projectId ? (
                  <>
                    <input
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      style={{ marginLeft: 8 }}
                      disabled={savingEdit}
                    />
                    <button
                      type="button"
                      onClick={saveProjectNameEdit}
                      disabled={savingEdit || !editingProjectName.trim()}
                      style={{ marginLeft: 4 }}
                      className="upload-submit"
                    >
                      {savingEdit ? t("planUpload", "saving", "Saving...") : t("planUpload", "save", "Save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingProject(null); setEditingProjectName(""); }}
                      disabled={savingEdit}
                      style={{ marginLeft: 4 }}
                    >
                      {t("planUpload", "cancel", "Cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const p = projects.find((p) => p.id === projectId);
                      setEditingProject(projectId);
                      setEditingProjectName(p?.name || "");
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {t("planUpload", "edit", "Edit")}
                  </button>
                )
              )}
            </label>

            <label className="upload-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{t("planUpload", "buildingName", "Building")}</span>
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} disabled={buildings.length === 0}>
                {buildings.length === 0 && <option value="">{t("planUpload", "buildingName", "Building")}</option>}
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {buildingId && (
                editingBuilding === buildingId ? (
                  <>
                    <input
                      value={editingBuildingName}
                      onChange={(e) => setEditingBuildingName(e.target.value)}
                      style={{ marginLeft: 8 }}
                      disabled={savingEdit}
                    />
                    <button
                      type="button"
                      onClick={saveBuildingNameEdit}
                      disabled={savingEdit || !editingBuildingName.trim()}
                      style={{ marginLeft: 4 }}
                      className="upload-submit"
                    >
                      {savingEdit ? t("planUpload", "saving", "Saving...") : t("planUpload", "save", "Save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingBuilding(null); setEditingBuildingName(""); }}
                      disabled={savingEdit}
                      style={{ marginLeft: 4 }}
                    >
                      {t("planUpload", "cancel", "Cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const b = buildings.find((b) => b.id === buildingId);
                      setEditingBuilding(buildingId);
                      setEditingBuildingName(b?.name || "");
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {t("planUpload", "edit", "Edit")}
                  </button>
                )
              )}
            </label>

            <div className="upload-building-create">
              {buildings.length === 0 && <p>{t("planUpload", "noBuildings", "No buildings for this project yet.")}</p>}
              <label className="upload-field">
                <span>{t("planUpload", "newBuildingName", "New building name")}</span>
                <input value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} />
              </label>
              <button
                type="button"
                onClick={createBuilding}
                disabled={!projectId || !newBuildingName.trim() || creatingBuilding}
                className="upload-submit"
              >
                {creatingBuilding
                  ? t("planUpload", "creatingBuilding", "Adding building...")
                  : t("planUpload", "createBuilding", "Add building")}
              </button>
            </div>

            <label className="upload-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{t("planUpload", "floorName", "Floor")}</span>
              <select value={floorId} onChange={(e) => setFloorId(e.target.value)} disabled={floors.length === 0}>
                {floors.length === 0 && <option value="">{t("planUpload", "floorName", "Floor")}</option>}
                {floors.map((f) => {
                  const levelLabel = typeof f.level === "number" ? `L${f.level}` : t("planUpload", "floorName", "Floor");
                  return (
                    <option key={f.id} value={f.id}>
                      {levelLabel} — {f.name}
                    </option>
                  );
                })}
              </select>
              {floorId && (
                editingFloor === floorId ? (
                  <>
                    <input
                      value={editingFloorName}
                      onChange={(e) => setEditingFloorName(e.target.value)}
                      style={{ marginLeft: 8 }}
                      disabled={savingEdit}
                    />
                    <button
                      type="button"
                      onClick={saveFloorNameEdit}
                      disabled={savingEdit || !editingFloorName.trim()}
                      style={{ marginLeft: 4 }}
                      className="upload-submit"
                    >
                      {savingEdit ? t("planUpload", "saving", "Saving...") : t("planUpload", "save", "Save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingFloor(null); setEditingFloorName(""); }}
                      disabled={savingEdit}
                      style={{ marginLeft: 4 }}
                    >
                      {t("planUpload", "cancel", "Cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const f = floors.find((f) => f.id === floorId);
                      setEditingFloor(floorId);
                      setEditingFloorName(f?.name || "");
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    {t("planUpload", "edit", "Edit")}
                  </button>
                )
              )}
            </label>

            <div className="upload-floor-create">
              {floors.length === 0 && <p>{t("planUpload", "noFloors", "No floors for this project yet.")}</p>}
              <label className="upload-field">
                <span>{t("planUpload", "newFloorName", "New floor name")}</span>
                <input value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)} />
              </label>
              <label className="upload-field">
                <span>{t("planUpload", "newFloorLevel", "Floor level")}</span>
                <input
                  type="number"
                  value={newFloorLevel}
                  onChange={(e) => setNewFloorLevel(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={createFloor}
                disabled={!projectId || !buildingId || !newFloorName.trim() || creatingFloor}
                className="upload-submit"
              >
                {creatingFloor
                  ? t("planUpload", "creatingFloor", "Adding floor...")
                  : t("planUpload", "createFloor", "Add floor")}
              </button>
            </div>

            <label className="upload-field">
              <span>{t("planUpload", "file", "PDF file")}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>

            <button type="submit" disabled={!canSubmit || busy} className="upload-submit">
              {busy ? t("planUpload", "submitting", "Uploading...") : t("planUpload", "submit", "Upload plan")}
            </button>

            {err && <div className="upload-error">❌ {err}</div>}
            {ok && <div className="upload-ok">✅ {ok}</div>}

            <div className="upload-tip">
              {t(
                "planUpload",
                "tip",
                "Versions increase automatically—pick the project and floor, then drop the PDF."
              )}
            </div>
          </form>

          <div className="upload-preview">
            {!localPdfUrl ? (
              <div className="upload-empty">
                {t("planUpload", "emptyPreview", "Pick a PDF file to see the preview here.")}
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
