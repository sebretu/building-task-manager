"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; error: { code: string; message: string; meta?: any } };

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE_WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  due_date: string | null;
  assigned_user_id: string | null;
  plan_id?: string;
  x_norm?: number | null;
  y_norm?: number | null;
};

type TaskPhoto = {
  id: string;
  task_id: string;
  url: string;
  caption: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  email?: string;
};

type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
};

type TaskHistoryRow = {
  id: string;
  task_id: string;
  changed_by: string | null;
  action?: string | null;
  summary?: string | null;
  meta?: any;
  created_at: string;
};

type PlanRow = {
  id: string;
  project_id: string;
  name: string;
  floor: string;
  version: number;
  pdf_url: string | null;
  created_at: string;
};

type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  caption: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ✅ FIX: podmień dowolny "http://<host>:54321" na "{proto}//{hostname}:54321"
function fixStorageUrl(u: string) {
  if (!u) return u;
  if (typeof window === "undefined") return u;

  const host = window.location.hostname;
  const proto = window.location.protocol; // "http:" albo "https:"
  return u.replace(/^http:\/\/[^/]+:54321/i, `${proto}//${host}:54321`);
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function TaskDrawer({
  open,
  taskId,
  onClose,
  uploadedBy,
  createDraft,
  showOverlay = true,
}: {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  uploadedBy: string;
  // createDraft = tryb CREATE (klik w mapę)
  createDraft?: {
    project_id: string;
    plan_id: string;
    x_norm: number;
    y_norm: number;
    created_by?: string;
  } | null;
  showOverlay?: boolean;
}) {
  const isCreate = !!createDraft && !taskId;
  const { t, language } = useLanguage();

  const [task, setTask] = useState<TaskRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [photos, setPhotos] = useState<TaskPhoto[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [history, setHistory] = useState<TaskHistoryRow[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskRow["status"]>("OPEN");
  const [priority, setPriority] = useState<TaskRow["priority"]>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const [caption, setCaption] = useState(""); // caption dla kolejnego dodawanego pliku
  const [newComment, setNewComment] = useState(""); // nowy komentarz
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ⭐ lista profili do dropdown
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [tileStatus, setTileStatus] = useState<"unknown" | "ok" | "error">("unknown");
  const localeByLang: Record<string, string> = {
    en: "en-US",
    pl: "pl-PL",
    de: "de-DE",
    sk: "sk-SK",
  };

  const canShow = open && (!!taskId || !!createDraft);

  const headerTitle = useMemo(() => {
    if (isCreate) return t("taskDrawer", "newTask");
    if (!taskId) return t("home", "title");
    return task?.title ? `${t("home", "title")}: ${task.title}` : `${t("home", "title")}: ${taskId}`;
  }, [isCreate, taskId, task?.title, t]);

  async function loadProfilesOnce() {
    if (profilesLoaded) return;
    try {
      const data = await apiGet<ProfileRow[]>("/api/profiles?limit=1000");
      setProfiles(data || []);
    } finally {
      setProfilesLoaded(true);
    }
  }

  async function loadAll(id: string) {
    setErr(null);
    try {
      const taskData = await apiGet<TaskRow>(`/api/task?id=${encodeURIComponent(id)}`);
      setTask(taskData);

      // ustaw formularz z taska
      setTitle(taskData.title || "");
      setDescription(taskData.description || "");
      setStatus((taskData.status as any) || "OPEN");
      setPriority((taskData.priority as any) || "MEDIUM");
      setDueDate(taskData.due_date || "");
      setAssignedUserId(taskData.assigned_user_id || "");

      // Load plan if we have plan_id
      if (taskData.plan_id) {
        try {
          const planData = await apiGet<PlanRow>(`/api/plan?id=${encodeURIComponent(taskData.plan_id)}`);
          setPlan(planData);
        } catch (e) {
          console.log("Could not load plan:", e);
        }
      }

      const photoData = await apiGet<TaskPhoto[]>(`/api/task-photos?taskId=${encodeURIComponent(id)}`);
      const fixed = (photoData || []).map((p) => ({ ...p, url: fixStorageUrl(p.url) }));
      setPhotos(fixed);

      const commentData = await apiGet<TaskComment[]>(`/api/task-comments?taskId=${encodeURIComponent(id)}`);
      setComments(commentData || []);

      const historyData = await apiGet<TaskHistoryRow[]>(`/api/task-history?taskId=${encodeURIComponent(id)}`);
      setHistory(historyData || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // open => doładuj profile
  useEffect(() => {
    if (!canShow) return;
    loadProfilesOnce().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow]);

  // open => edit mode: load task / create mode: reset
  useEffect(() => {
    if (!canShow) return;

    if (taskId) {
      loadAll(taskId).catch(() => {});
      return;
    }

    if (isCreate) {
      setTask(null);
      setPhotos([]);
      setComments([]);
      setHistory([]);
      setNewComment("");
      setErr(null);
      setTitle(t("taskDrawer", "newTask"));
      setDescription("");
      setStatus("OPEN");
      setPriority("MEDIUM");
      setDueDate("");
      setAssignedUserId("");
      setCaption("");
      // pendingPhotos zostawiamy — user może dodać zdjęcia przed zapisem
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow, taskId, isCreate]);

  // cleanup blob urls
  useEffect(() => {
    return () => {
      for (const p of pendingPhotos) {
        try {
          URL.revokeObjectURL(p.previewUrl);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTileStatus("unknown");
  }, [plan?.id]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(17,24,39,0.15)",
    background: "#fff",
    color: "#111827",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 12,
    color: "#111827",
  };

  function addPending(file: File) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    const cap = caption.trim() === "" ? null : caption.trim();
    setCaption("");
    setPendingPhotos((prev) => [{ id, file, previewUrl, caption: cap }, ...prev]);
  }

  function removePending(id: string) {
    setPendingPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) {
        try {
          URL.revokeObjectURL(hit.previewUrl);
        } catch {}
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadOne(task_id: string, file: File, cap: string | null) {
    const base64 = await fileToBase64(file);

    const data = await apiPost<TaskPhoto>("/api/task-photos", {
      task_id,
      file_name: file.name || "photo.jpg",
      caption: cap,
      base64,
    });

    const newPhoto: TaskPhoto = { ...data, url: fixStorageUrl(data.url) };
    return newPhoto;
  }

  async function save() {
    setErr(null);

    if (!isUuid(uploadedBy)) return setErr(t("taskDrawer", "errorInvalidUploadedBy"));

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setErr(t("taskDrawer", "errorTitleRequired"));

    const trimmedAssigned = assignedUserId.trim();
    if (trimmedAssigned && !isUuid(trimmedAssigned)) return setErr(t("taskDrawer", "errorAssignedUser"));

    setSaving(true);
    try {
      // CREATE
      if (isCreate) {
        const d = createDraft!;

        const newData = await apiPost<TaskRow>("/api/tasks", {
          project_id: d.project_id,
          plan_id: d.plan_id,
          x_norm: d.x_norm,
          y_norm: d.y_norm,
          title: trimmedTitle,
          description: description.trim() === "" ? null : description.trim(),
          status,
          priority,
          due_date: dueDate.trim() === "" ? null : dueDate.trim(),
          assigned_user_id: trimmedAssigned ? trimmedAssigned : null,
        });

        const newId = newData?.id as string | undefined;
        if (!newId) throw new Error(t("taskDrawer", "errorCreateMissingId"));

        // ✅ FIX #1: ustaw assigned_user_id po CREATE przez PATCH (żeby działało jak w edit)
        if (trimmedAssigned) {
          await apiPatch<TaskRow>("/api/tasks", {
            id: newId,
            assigned_user_id: trimmedAssigned,
          });
        }

        // 🚀 upload pending zdjęć po utworzeniu taska
        if (pendingPhotos.length) {
          setUploading(true);
          try {
            const uploaded: TaskPhoto[] = [];
            for (const p of pendingPhotos) {
              const ph = await uploadOne(newId, p.file, p.caption);
              uploaded.push(ph);
            }

            setPendingPhotos((prev) => {
              for (const p of prev) {
                try {
                  URL.revokeObjectURL(p.previewUrl);
                } catch {}
              }
              return [];
            });

            setPhotos((prev) => [...uploaded, ...prev]);

            window.dispatchEvent(new CustomEvent("task-photo-added", { detail: { taskId: newId } }));
          } finally {
            setUploading(false);
          }
        }

        window.dispatchEvent(new CustomEvent("task-created", { detail: { taskId: newId } }));

        // ✅ FIX #2: po ZAPISZ w create — zamknij drawer
        onClose();
        return;
      }

      // EDIT
      if (!taskId) throw new Error(t("taskDrawer", "errorMissingTaskId"));
      if (!isUuid(taskId)) throw new Error(t("taskDrawer", "errorInvalidTaskId"));

      await apiPatch<TaskRow>("/api/tasks", {
        id: taskId,
        title: trimmedTitle,
        description: description.trim() === "" ? null : description.trim(),
        status,
        priority,
        due_date: dueDate.trim() === "" ? null : dueDate.trim(),
        assigned_user_id: trimmedAssigned ? trimmedAssigned : null,
      });

      window.dispatchEvent(new CustomEvent("task-saved"));

      // ✅ FIX #2: po ZAPISZ w edit — zamknij drawer
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeTask() {
    if (!taskId) return;
    setErr(null);
    if (!isUuid(taskId)) return setErr(t("taskDrawer", "errorInvalidTaskId"));

    if (!confirm(t("taskDrawer", "confirmDelete"))) return;

    try {
      await apiDelete(`/api/task?id=${taskId}`);

      window.dispatchEvent(new CustomEvent("task-deleted"));
      onClose();
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  async function addComment() {
    if (!taskId) return;
    if (!newComment.trim()) return;

    setErr(null);
    try {
      const data = await apiPost<TaskComment>("/api/task-comments", {
        task_id: taskId,
        comment: newComment.trim(),
      });

      setComments((prev) => [...prev, data]);
      setNewComment("");
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // Drawer slide state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Always render the handle, panel slides in only when clicked
  return (
    <>
      {/* Drawer handle (button) always visible at right edge */}
      {!drawerOpen && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            right: 0,
            zIndex: 10000,
            transform: "translateY(-50%)",
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: "12px 16px",
              borderRadius: "12px 0 0 12px",
              border: "1px solid #ccc",
              background: "#fff",
              color: "#111827",
              fontWeight: 900,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              cursor: "pointer",
            }}
          >
            ≡
          </button>
        </div>
      )}

      {/* overlay */}
      {showOverlay && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9998,
          }}
        />
      )}

      {/* CARD */}
      <div
        style={{
          position: "fixed",
          top: 24,
          right: 24,
          bottom: 24,
          width: "min(560px, 96vw)",
          background: "linear-gradient(180deg, #ffffff, #f9fafb)",
          borderRadius: 18,
          boxShadow: drawerOpen ? "0 25px 60px rgba(0,0,0,0.35)" : "none",
          border: "1px solid rgba(0,0,0,0.08)",
          zIndex: 9999,
          display: drawerOpen ? "flex" : "none",
          flexDirection: "column",
          overflow: "hidden",
          color: "#111827",
          transition: "transform 0.3s cubic-bezier(.4,1.2,.4,1)",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            fontWeight: 900,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 14 }}>{headerTitle}</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!isCreate && !!taskId && (
              <button
                onClick={removeTask}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(185,28,28,0.35)",
                  background: "rgba(185,28,28,0.08)",
                  color: "#b91c1c",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {t("common", "delete")}
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(17,24,39,0.18)",
                background: "#fff",
                color: "#111827",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* BODY */}
        <div style={{ padding: 16, overflow: "auto", display: "grid", gap: 16 }}>
          {err && (
            <div style={{ color: "#b91c1c", fontWeight: 700, background: "rgba(185,28,28,0.06)", padding: 10, borderRadius: 12 }}>
              {err}
            </div>
          )}

          <label style={labelStyle}>
            <span style={{ fontWeight: 800 }}>{t("taskDrawer", "title")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </label>

          <label style={labelStyle}>
            <span style={{ fontWeight: 800 }}>{t("taskDrawer", "description")}</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>{t("taskDrawer", "status")}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
                <option value="OPEN">{t("taskStatus", "OPEN")}</option>
                <option value="IN_PROGRESS">{t("taskStatus", "IN_PROGRESS")}</option>
                <option value="DONE_WAITING_APPROVAL">{t("taskStatus", "DONE_WAITING_APPROVAL")}</option>
                <option value="APPROVED">{t("taskStatus", "APPROVED")}</option>
                <option value="REJECTED">{t("taskStatus", "REJECTED")}</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>{t("taskDrawer", "assignedUser")}</span>
              <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>{t("taskDrawer", "priority")}</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)} style={inputStyle}>
                <option value="LOW">{t("taskPriority", "LOW")}</option>
                <option value="MEDIUM">{t("taskPriority", "MEDIUM")}</option>
                <option value="HIGH">{t("taskPriority", "HIGH")}</option>
                <option value="CRITICAL">{t("taskPriority", "CRITICAL")}</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span style={{ fontWeight: 800 }}>{t("taskDrawer", "dueDate")}</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>

          {/* PLAN MAP PREVIEW */}
          {/* Usunięto podgląd mapy z pinem i link do pełnej mapy na prośbę użytkownika */}
          {/* WORKFLOW BUTTONS */}
          {!isCreate && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(17,24,39,0.6)" }}>{t("taskDrawer", "workflowActions")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {status === "OPEN" && (
                  <button
                    onClick={() => setStatus("IN_PROGRESS")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(59,130,246,0.35)",
                      background: "rgba(59,130,246,0.08)",
                      color: "#2563eb",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {t("taskDrawer", "startWork")}
                  </button>
                )}

                {status === "IN_PROGRESS" && (
                  <button
                    onClick={() => setStatus("DONE_WAITING_APPROVAL")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(249,115,22,0.35)",
                      background: "rgba(249,115,22,0.08)",
                      color: "#ea580c",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {t("taskDrawer", "markDone")}
                  </button>
                )}

                {status === "DONE_WAITING_APPROVAL" && (
                  <>
                    <button
                      onClick={() => setStatus("APPROVED")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(34,197,94,0.35)",
                        background: "rgba(34,197,94,0.08)",
                        color: "#16a34a",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {t("taskDrawer", "approve")}
                    </button>
                    <button
                      onClick={() => setStatus("REJECTED")}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(239,68,68,0.35)",
                        background: "rgba(239,68,68,0.08)",
                        color: "#dc2626",
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      {t("taskDrawer", "reject")}
                    </button>
                  </>
                )}

                {(status === "APPROVED" || status === "REJECTED") && (
                  <div style={{ fontSize: 13, color: "rgba(17,24,39,0.5)", fontStyle: "italic" }}>
                    {t("taskDrawer", "finalStatus")}: {status === "APPROVED" ? t("taskDrawer", "approvedStatus") : t("taskDrawer", "rejectedStatus")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={save}
              disabled={saving || uploading}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(17,24,39,0.20)",
                background: "#111827",
                color: "#fff",
                cursor: saving || uploading ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              {saving ? t("taskDrawer", "saving") : t("common", "save")}
            </button>

            <button
              onClick={onClose}
              disabled={saving || uploading}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(17,24,39,0.18)",
                background: "#fff",
                color: "#111827",
                cursor: saving || uploading ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              {t("taskDrawer", "close")}
            </button>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid rgba(17,24,39,0.10)" }} />

          {/* PHOTOS */}
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{t("taskDrawer", "photos")}</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
              <label style={labelStyle}>
                <span style={{ fontWeight: 800 }}>{t("taskDrawer", "captionLabel")}</span>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
              </label>

              <label style={{ ...labelStyle, cursor: uploading ? "not-allowed" : "pointer" }}>
                <span style={{ fontWeight: 800 }}>{t("taskDrawer", "addPhoto")}</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    e.currentTarget.value = "";

                    if (isCreate) {
                      addPending(f);
                      return;
                    }

                    // EDIT: od razu upload
                    if (!taskId) return;
                    setUploading(true);
                    (async () => {
                      try {
                        const ph = await uploadOne(taskId, f, caption.trim() === "" ? null : caption.trim());
                        setCaption("");
                        setPhotos((prev) => [ph, ...prev]);
                        window.dispatchEvent(new CustomEvent("task-photo-added", { detail: { taskId } }));
                      } catch (e2: any) {
                        setErr(e2?.message || String(e2));
                      } finally {
                        setUploading(false);
                      }
                    })();
                  }}
                />
              </label>
            </div>

            {/* CREATE: pending */}
            {pendingPhotos.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>
                  {t("taskDrawer", "pendingPhotos")}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {pendingPhotos.map((p) => (
                    <div key={p.id} style={{ position: "relative" }}>
                      <img
                        src={p.previewUrl}
                        alt=""
                        style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(17,24,39,0.10)" }}
                      />
                      <button
                        onClick={() => removePending(p.id)}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 26,
                          height: 26,
                          borderRadius: 999,
                          border: "1px solid rgba(17,24,39,0.25)",
                          background: "rgba(255,255,255,0.92)",
                          cursor: "pointer",
                          fontWeight: 900,
                        }}
                        title={t("common", "delete")}
                      >
                        ✕
                      </button>
                      {p.caption && (
                        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85, wordBreak: "break-word" }}>{p.caption}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EDIT/CREATE: existing photos list */}
            {photos.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <img
                      src={p.url}
                      alt={p.caption || ""}
                      style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 12, border: "1px solid rgba(17,24,39,0.10)" }}
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}

            {photos.length === 0 && pendingPhotos.length === 0 && (
              <div style={{ fontSize: 12, opacity: 0.75 }}>{t("taskDrawer", "photos")}: 0</div>
            )}
          </div>

          {/* COMMENTS */}
          {!isCreate && (
            <>
              <hr style={{ border: "none", borderTop: "1px solid rgba(17,24,39,0.10)" }} />
              
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{t("taskDrawer", "comments")} ({comments.length})</div>

                {/* Add comment input */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t("taskDrawer", "addComment")}
                    style={{
                      ...inputStyle,
                      minHeight: 60,
                      resize: "vertical",
                      flex: 1,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        addComment();
                      }
                    }}
                  />
                  <button
                    onClick={addComment}
                    disabled={!newComment.trim()}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(17,24,39,0.20)",
                      background: newComment.trim() ? "#111827" : "rgba(17,24,39,0.05)",
                      color: newComment.trim() ? "#fff" : "rgba(17,24,39,0.4)",
                      cursor: newComment.trim() ? "pointer" : "not-allowed",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t("common", "save")}
                  </button>
                </div>

                {/* Comments list */}
                {comments.length > 0 && (
                  <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                    {comments.map((c) => {
                      const profile = profiles.find((p) => p.id === c.user_id);
                      const userName = profile?.full_name || c.user_id.slice(0, 8);
                      const timestamp = new Date(c.created_at).toLocaleString(localeByLang[language] || "en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(17,24,39,0.10)",
                            background: "rgba(17,24,39,0.02)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>{userName}</div>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>{timestamp}</div>
                          </div>
                          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.comment}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {comments.length === 0 && (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{t("taskDrawer", "noComments")}</div>
                )}
              </div>

              <hr style={{ border: "none", borderTop: "1px solid rgba(17,24,39,0.10)" }} />

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{t("taskDrawer", "history")}</div>

                {history.length > 0 ? (
                  <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto" }}>
                    {history.map((h) => {
                      const actor = profiles.find((p) => p.id === h.changed_by);
                      const actorName = actor?.full_name || (h.changed_by ? h.changed_by.slice(0, 8) : "—");
                      const timestamp = new Date(h.created_at).toLocaleString(localeByLang[language] || "en-US", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const action = h.action || h.summary || t("taskDrawer", "historyUpdate");

                      return (
                        <div
                          key={h.id}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid rgba(17,24,39,0.10)",
                            background: "rgba(17,24,39,0.02)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>{actorName}</div>
                            <div style={{ fontSize: 11, opacity: 0.6 }}>{timestamp}</div>
                          </div>
                          <div style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{action}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{t("taskDrawer", "noHistory")}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
