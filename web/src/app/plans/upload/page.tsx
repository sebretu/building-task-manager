"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type Project = { id: string; name: string };
type Floor = { id: string; name: string; level: number | null };

export default function PlansUploadPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [floors, setFloors] = useState<Floor[]>([]);
  const [floorId, setFloorId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [newFloorName, setNewFloorName] = useState("");
  const [newFloorLevel, setNewFloorLevel] = useState("");
  const [creatingFloor, setCreatingFloor] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);

  const handleAuthRedirect = useCallback(
    (message: string) => {
      const msg = message.toLowerCase();
      if (msg.includes("bearer token") || msg.includes("auth_required") || msg.includes("auth invalid")) {
        router.replace("/auth/login");
        return true;
      }
      return false;
    },
    [router]
  );

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
    return isAdmin && !!file && !!projectId && !!floorId;
  }, [isAdmin, file, projectId, floorId]);

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

  useEffect(() => {
    if (!projectId || !sessionChecked || !isAdmin) {
      setFloors([]);
      setFloorId("");
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
        setFloors(fs);
        if (fs.length === 0) {
          setFloorId("");
        } else if (!fs.find((f) => f.id === floorId)) {
          setFloorId(fs[0].id);
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
  }, [projectId, floorId, handleAuthRedirect, sessionChecked, isAdmin]);

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
    <>
      <div className="home-hero upload-hero">
        <section className="home-hero-content upload-hero-content">
          <div className="home-hero-text">
            <div className="home-hero-kicker">{t("planUpload", "kicker", "Upload")}</div>
            <h1 className="home-hero-title">{t("planUpload", "title", "Upload plan (PDF)")}</h1>
            <p className="home-hero-subtitle">
              {t(
                "planUpload",
                "subtitle",
                "Select the project and floor, attach the PDF, and we will version it automatically."
              )}
            </p>
            <div className="home-hero-actions">
              <Link href="/plans" className="home-hero-secondary">
                {t("planUpload", "back", "Back to plans")}
              </Link>
            </div>
          </div>
          <div className="home-hero-media upload-hero-media">
            <div className="home-hero-panel">
              <div className="home-hero-panel-title">Gotowy do wysyłki</div>
              <div className="home-hero-panel-body">
                Uzupełnij dane i wybierz PDF, aby rozpocząć import.
              </div>
              <div className="upload-hero-tags">
                <span>PDF</span>
                <span>Tiles</span>
                <span>Auto-redirect</span>
              </div>
            </div>
            <div className="home-hero-grid" />
          </div>
        </section>
      </div>

      <main className="home-main upload-main">
        <section className="home-task-panel upload-panel">
          <div className="home-section-header">
            <h2>{t("planUpload", "formTitle", "New plan")}</h2>
            <p>
              {t("planUpload", "formDescription", "Fill in the details and preview the PDF before uploading.")}
            </p>
          </div>

          <div className="upload-grid">
            <form onSubmit={onSubmit} className="upload-form">
              <label className="upload-field">
                <span>{t("planUpload", "projectName", "Project name")}</span>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.length === 0 && <option value="">{t("planUpload", "projectName", "Project name")}</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="upload-field">
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
                  disabled={!projectId || !newFloorName.trim() || creatingFloor}
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
    </>
  );
}
