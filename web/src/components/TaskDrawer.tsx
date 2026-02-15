"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/translations";

type PhotoType = "BEFORE" | "AFTER";

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
  photo_type?: PhotoType | null;
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
  photoType: PhotoType;
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
  currentUserId,
  currentUserRole,
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
  currentUserId?: string | null;
  currentUserRole?: string | null;
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
  const [photosLoaded, setPhotosLoaded] = useState<boolean>(isCreate);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [descriptionDirty, setDescriptionDirty] = useState(false);
  const [status, setStatus] = useState<TaskRow["status"]>("OPEN");
  const [priority, setPriority] = useState<TaskRow["priority"]>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const [caption, setCaption] = useState(""); // caption dla kolejnego dodawanego pliku
  const [nextPhotoType, setNextPhotoType] = useState<PhotoType>("BEFORE");
  const [newComment, setNewComment] = useState(""); // nowy komentarz
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translationMap, setTranslationMap] = useState<Record<string, string>>({});
  const [translationLang, setTranslationLang] = useState<Language | null>(null);
  const [translatingContent, setTranslatingContent] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

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

  const normalizedRole = (currentUserRole || "").toUpperCase();
  const isAdmin = normalizedRole === "ADMIN";
  const isAssignedToCurrentUser = !!currentUserId && !!task && task.assigned_user_id === currentUserId;
  const canUpdateStatus = isAdmin || isAssignedToCurrentUser;
  const canEditFields = isAdmin || isCreate || isAssignedToCurrentUser;
  const canEditPriority = isAdmin || isCreate || isAssignedToCurrentUser;
  const canEditDueDate = canEditPriority;
  const canManagePhotos = isAdmin || isAssignedToCurrentUser || isCreate;
  const canSubmit = isCreate ? !!currentUserId : canUpdateStatus;

  const canShow = open && (!!taskId || !!createDraft);

  const hasAfterPhoto = useMemo(() => {
    const uploadedAfter = photos.some((p) => (p.photo_type || "BEFORE") === "AFTER");
    const pendingAfter = pendingPhotos.some((p) => p.photoType === "AFTER");
    return uploadedAfter || pendingAfter;
  }, [photos, pendingPhotos]);

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
    setPhotosLoaded(false);
    try {
      const taskData = await apiGet<TaskRow>(`/api/task?id=${encodeURIComponent(id)}`);
      setTask(taskData);

      // ustaw formularz z taska
      setTitle(taskData.title || "");
      setTitleDirty(false);
      setDescription(taskData.description || "");
      setDescriptionDirty(false);
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

      const photoData = await apiGet<TaskPhoto[]>(`/api/task-photos?taskId=${encodeURIComponent(id)}&t=${Date.now()}`);
      const fixed = (photoData || []).map((p) => ({ ...p, url: fixStorageUrl(p.url) }));
      setPhotos(fixed);

      const commentData = await apiGet<TaskComment[]>(`/api/task-comments?taskId=${encodeURIComponent(id)}`);
      setComments(commentData || []);

      const historyData = await apiGet<TaskHistoryRow[]>(`/api/task-history?taskId=${encodeURIComponent(id)}`);
      setHistory(historyData || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setPhotosLoaded(true);
    }
  }

  // open => doładuj profile
  useEffect(() => {
    if (!canShow) return;
    loadProfilesOnce().catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canShow]);

  // open => edit mode: load task / create mode: reset
  useEffect(() => {
    if (!canShow) return;

    if (taskId) {
      loadAll(taskId).catch(() => { });
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
      setTitleDirty(false);
      setDescription("");
      setDescriptionDirty(false);
      setStatus("OPEN");
      setPriority("MEDIUM");
      setDueDate("");
      const draftCreator = createDraft?.created_by;
      if (draftCreator && isUuid(draftCreator)) {
        setAssignedUserId(draftCreator);
      } else if (currentUserId && isUuid(currentUserId)) {
        setAssignedUserId(currentUserId);
      } else {
        setAssignedUserId("");
      }
      setCaption("");
      setPhotosLoaded(true);
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
        } catch { }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTileStatus("unknown");
  }, [plan?.id]);

  useEffect(() => {
    if (!taskId || !task || isCreate) {
      setTranslationMap({});
      setTranslationLang(language);
      setTranslationError(null);
      setTranslatingContent(false);
      return;
    }

    const items: { key: string; text: string }[] = [];
    if (task.title?.trim()) {
      items.push({ key: `task.title:${task.id}`, text: task.title });
    }
    if (task.description?.trim()) {
      items.push({ key: `task.description:${task.id}`, text: task.description });
    }
    comments.forEach((c) => {
      if (c.comment?.trim()) {
        items.push({ key: `comment:${c.id}`, text: c.comment });
      }
    });
    history.forEach((h) => {
      const historyText = (h.action || h.summary)?.trim();
      if (historyText) {
        items.push({ key: `history:${h.id}`, text: historyText });
      }
    });

    if (items.length === 0) {
      setTranslationMap({});
      setTranslationLang(language);
      setTranslationError(null);
      setTranslatingContent(false);
      return;
    }

    let alive = true;
    setTranslatingContent(true);
    setTranslationError(null);

    apiPost<{ translations: string[] }>("/api/translate", {
      targetLang: language,
      texts: items.map((i) => i.text),
    })
      .then((payload) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        (payload.translations || []).forEach((value, idx) => {
          const key = items[idx]?.key;
          if (key && typeof value === "string") {
            next[key] = value;
          }
        });
        setTranslationMap(next);
        setTranslationLang(language);
      })
      .catch((e: any) => {
        if (!alive) return;
        setTranslationError(e?.message || String(e));
        setTranslationMap({});
      })
      .finally(() => {
        if (!alive) return;
        setTranslatingContent(false);
      });

    return () => {
      alive = false;
    };
  }, [language, taskId, task?.id, task?.title, task?.description, comments, history, isCreate]);

  useEffect(() => {
    if (!taskId || isCreate) return;
    if (translationLang !== language) return;

    const titleKey = makeTranslationKey("task.title", task?.id);
    if (titleKey) {
      const translatedTitle = translationMap[titleKey];
      if (translatedTitle && !titleDirty && translatedTitle !== title) {
        setTitle(translatedTitle);
      }
    }

    const descKey = makeTranslationKey("task.description", task?.id);
    if (descKey) {
      const translatedDesc = translationMap[descKey];
      if (translatedDesc && !descriptionDirty && translatedDesc !== description) {
        setDescription(translatedDesc);
      }
    }
  }, [taskId, isCreate, translationLang, language, translationMap, task?.id, titleDirty, descriptionDirty, title, description]);







  function ensureAfterPhotoPresent() {
    if (!photosLoaded) {
      setErr(t("taskDrawer", "afterPhotoLoading", "Ładuję zdjęcia zadania, spróbuj ponownie za chwilę."));
      return false;
    }
    if (hasAfterPhoto) return true;
    setErr(t("taskDrawer", "afterPhotoRequired", "Brak zdjęcia po wykonaniu prac"));
    return false;
  }

  function ensureBeforePhotoForCreate() {
    if (!isCreate) return true;
    const pendingBefore = pendingPhotos.some((p) => p.photoType === "BEFORE");
    if (pendingBefore) return true;
    setErr(t("taskDrawer", "beforePhotoRequired", "Brak zdjęcia dodaj"));
    return false;
  }

  function addPending(file: File) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    const cap = caption.trim() === "" ? null : caption.trim();
    setCaption("");
    setPendingPhotos((prev) => [{ id, file, previewUrl, caption: cap, photoType: nextPhotoType }, ...prev]);
  }

  const makeTranslationKey = (scope: string, entityId?: string | null) => {
    if (!entityId) return null;
    return `${scope}:${entityId}`;
  };

  const renderTranslationSegment = (key: string | null, original?: string | null) => {
    if (!key || translationLang !== language) return null;
    const translated = translationMap[key];
    if (!translated) return null;
    const trimmedTranslated = translated.trim();
    if (!trimmedTranslated) return null;
    const trimmedOriginal = (original ?? "").trim();
    if (trimmedOriginal && trimmedOriginal === trimmedTranslated) return null;
    return (
      <div className="mt-1.5 text-xs text-muted-foreground italic leading-relaxed">
        <span className="font-bold">{t("taskDrawer", "autoTranslateLabel", "Auto translation")}:</span> {trimmedTranslated}
      </div>
    );
  };

  function removePending(id: string) {
    setPendingPhotos((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) {
        try {
          URL.revokeObjectURL(hit.previewUrl);
        } catch { }
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function uploadOne(task_id: string, file: File, cap: string | null, photoType: PhotoType) {
    const base64 = await fileToBase64(file);

    const data = await apiPost<TaskPhoto>("/api/task-photos", {
      task_id,
      file_name: file.name || "photo.jpg",
      caption: cap,
      base64,
      photo_type: photoType,
    });

    const newPhoto: TaskPhoto = { ...data, url: fixStorageUrl(data.url) };
    return newPhoto;
  }

  async function save() {
    setErr(null);

    if (!isUuid(uploadedBy)) return setErr(t("taskDrawer", "errorInvalidUploadedBy"));

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setErr(t("taskDrawer", "errorTitleRequired"));

    let trimmedAssigned = assignedUserId.trim();
    if (!isAdmin && !trimmedAssigned && currentUserId) {
      trimmedAssigned = currentUserId;
    }
    if (trimmedAssigned && !isUuid(trimmedAssigned)) return setErr(t("taskDrawer", "errorAssignedUser"));
    if (isCreate && !isAdmin && !trimmedAssigned) {
      return setErr(t("taskDrawer", "errorAssignedUser"));
    }

    if (!isCreate && !canUpdateStatus) {
      return setErr(t("taskDrawer", "noPermission", "Brak uprawnień"));
    }

    const requestingApproval = status === "DONE_WAITING_APPROVAL" && (isCreate || task?.status !== "DONE_WAITING_APPROVAL");
    if (requestingApproval && !ensureAfterPhotoPresent()) {
      return;
    }

    if (isCreate && !ensureBeforePhotoForCreate()) {
      return;
    }

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

        // 🚀 upload pending zdjęć po utworzeniu taska
        if (pendingPhotos.length) {
          setUploading(true);
          try {
            const uploaded: TaskPhoto[] = [];
            for (const p of pendingPhotos) {
              const ph = await uploadOne(newId, p.file, p.caption, p.photoType);
              uploaded.push(ph);
            }

            setPendingPhotos((prev) => {
              for (const p of prev) {
                try {
                  URL.revokeObjectURL(p.previewUrl);
                } catch { }
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

      // Use original values if fields haven't been edited (prevents saving translations)
      const finalTitle = titleDirty ? trimmedTitle : (task?.title || trimmedTitle);
      const finalDescription = descriptionDirty ? (description.trim() === "" ? null : description.trim()) : (task?.description || null);

      const nextDueDate = dueDate.trim() === "" ? null : dueDate.trim();
      const nextAssigned = trimmedAssigned ? trimmedAssigned : null;

      const patchBody: Record<string, any> = { id: taskId };

      if (isAdmin) {
        patchBody.title = finalTitle;
        patchBody.description = finalDescription;
        patchBody.status = status;
        patchBody.priority = priority;
        patchBody.due_date = nextDueDate;
        patchBody.assigned_user_id = nextAssigned;
      } else {
        patchBody.status = status;
        if (canEditFields) {
          patchBody.title = finalTitle;
          patchBody.description = finalDescription;
        }
        if (canEditPriority) {
          patchBody.priority = priority;
        }
        if (canEditDueDate) {
          patchBody.due_date = nextDueDate;
        }
      }

      await apiPatch<TaskRow>("/api/tasks", patchBody);

      window.dispatchEvent(new CustomEvent("task-saved"));

      // ✅ FIX #2: po ZAPISZ w edit — zamknij drawer
      onClose();
    } catch (err: any) {
      console.error("Task save error:", err);

      // Offline handling
      const isOffline = !navigator.onLine || err.message === "Failed to fetch" || err.message?.includes("Network request failed");

      if (isOffline && isCreate) {
        const d = createDraft!;
        const pendingForQueue: { fileName: string; caption: string | null; base64: string; photoType: string }[] = [];

        // Convert pending photos to base64
        for (const p of pendingPhotos) {
          const b64 = await fileToBase64(p.file);
          pendingForQueue.push({
            fileName: p.file.name || "photo.jpg",
            caption: p.caption,
            base64: b64,
            photoType: p.photoType
          });
        }

        const taskData = {
          project_id: d.project_id,
          plan_id: d.plan_id,
          x_norm: d.x_norm,
          y_norm: d.y_norm,
          title: title.trim(),
          description: description.trim() === "" ? null : description.trim(),
          status,
          priority,
          due_date: dueDate.trim() === "" ? null : dueDate.trim(),
          assigned_user_id: assignedUserId.trim() ? assignedUserId.trim() : null,
        };

        // @ts-ignore
        await import("@/lib/offline/queue").then(({ MutationQueue }) => {
          // @ts-ignore
          return MutationQueue.enqueue('CREATE_COMPOSITE_TASK', 'tasks', {
            taskData,
            photos: pendingForQueue
          });
        });

        alert(t("taskDrawer", "savedOffline", "Brak internetu. Task został zapisany w kolejce i wyśle się po odzyskaniu połączenia."));

        setPendingPhotos([]);
        onClose();
        return;
      }

      setErr(err?.message || String(err));
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
  const prevCanShowRef = useRef<boolean>(canShow);

  useEffect(() => {
    if (canShow && !prevCanShowRef.current) {
      setDrawerOpen(true);
    }
    if (!canShow) {
      setDrawerOpen(false);
    }
    prevCanShowRef.current = canShow;
  }, [canShow]);

  useEffect(() => {
    if (taskId || createDraft) {
      setDrawerOpen(true);
    }
  }, [taskId, createDraft]);

  // Always render the handle, it toggles the panel
  return (
    <>
      {/* overlay */}
      {showOverlay && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-black/45 z-[9998] backdrop-blur-sm transition-opacity"
        />
      )}

      {/* CARD */}
      <div
        className={`fixed top-6 right-6 bottom-6 w-[min(560px,96vw)] bg-card rounded-2xl shadow-2xl border border-border z-[9999] flex flex-col overflow-hidden text-foreground transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "translate-x-[120%]"
          }`}
      >
        {/* HEADER */}
        <div className="p-4 border-b border-border flex justify-between items-center gap-2.5 font-bold bg-muted/30">
          <div className="text-sm truncate">{headerTitle}</div>

          <div className="flex items-center gap-2">
            {isAdmin && !isCreate && !!taskId && (
              <button
                onClick={removeTask}
                className="px-2.5 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 cursor-pointer font-bold text-xs hover:bg-red-500/20 transition-colors"
              >
                {t("common", "delete")}
              </button>
            )}

            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-border bg-background text-foreground cursor-pointer font-bold hover:bg-muted transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* BODY */}
        {/* BODY */}
        <div className="p-4 overflow-y-auto grid gap-4">
          {err && (
            <div className="text-red-700 font-bold bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 text-sm">
              {err}
            </div>
          )}

          {!isCreate && translatingContent && (
            <div className="bg-blue-500/10 text-blue-700 p-2.5 rounded-xl text-xs font-bold border border-blue-500/20">
              {t("taskDrawer", "autoTranslateLoading", "Translating content...")} ({language.toUpperCase()})
            </div>
          )}

          {!isCreate && translationError && (
            <div className="bg-amber-500/10 text-amber-700 p-2.5 rounded-xl text-xs font-bold border border-amber-500/20">
              {t("taskDrawer", "autoTranslateError", "Auto translation failed")}: {translationError}
            </div>
          )}

          <label className="grid gap-1.5 text-xs font-bold text-foreground">
            <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "title")}</span>
            <input
              value={title}
              onChange={(e) => {
                setTitleDirty(true);
                setTitle(e.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold"
              disabled={!canEditFields}
            />
          </label>
          {!isCreate && renderTranslationSegment(makeTranslationKey("task.title", task?.id), task?.title || title)}

          <label className="grid gap-1.5 text-xs font-bold text-foreground">
            <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "description")}</span>
            <textarea
              value={description}
              onChange={(e) => {
                setDescriptionDirty(true);
                setDescription(e.target.value);
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[110px] resize-y"
              disabled={!canEditFields}
            />
          </label>
          {!isCreate && renderTranslationSegment(makeTranslationKey("task.description", task?.id), task?.description || description)}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-bold text-foreground">
              <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "status")}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                disabled={!isAdmin}
              >
                <option value="OPEN">{t("taskStatus", "OPEN")}</option>
                <option value="IN_PROGRESS">{t("taskStatus", "IN_PROGRESS")}</option>
                <option value="DONE_WAITING_APPROVAL">{t("taskStatus", "DONE_WAITING_APPROVAL")}</option>
                <option value="APPROVED">{t("taskStatus", "APPROVED")}</option>
                <option value="REJECTED">{t("taskStatus", "REJECTED")}</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-foreground">
              <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "assignedUser")}</span>
              <select
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                disabled={!isAdmin}
              >
                <option value="">—</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-bold text-foreground">
              <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "priority")}</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                disabled={!canEditPriority}
              >
                <option value="LOW">{t("taskPriority", "LOW")}</option>
                <option value="MEDIUM">{t("taskPriority", "MEDIUM")}</option>
                <option value="HIGH">{t("taskPriority", "HIGH")}</option>
                <option value="CRITICAL">{t("taskPriority", "CRITICAL")}</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-foreground">
              <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "dueDate")}</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                disabled={!canEditDueDate}
              />
            </label>
          </div>

          {/* PLAN MAP PREVIEW */}
          {/* Usunięto podgląd mapy z pinem i link do pełnej mapy na prośbę użytkownika */}
          {/* WORKFLOW BUTTONS */}
          {!isCreate && canUpdateStatus && (
            <div className="grid gap-2">
              <div className="text-xs font-extrabold text-muted-foreground/70 uppercase tracking-wider">{t("taskDrawer", "workflowActions")}</div>
              <div className="flex gap-2 flex-wrap">
                {status === "OPEN" && (
                  <>
                    <button
                      onClick={() => setStatus("IN_PROGRESS")}
                      className="px-3.5 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 cursor-pointer font-bold text-sm hover:bg-blue-500/20 transition-colors"
                    >
                      {t("taskDrawer", "startWork")}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setStatus("APPROVED")}
                        className="px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 cursor-pointer font-bold text-sm hover:bg-emerald-500/20 transition-colors"
                      >
                        {t("taskDrawer", "approve")}
                      </button>
                    )}
                  </>
                )}

                {status === "IN_PROGRESS" && (
                  <button
                    onClick={() => {
                      if (!ensureAfterPhotoPresent()) return;
                      setStatus("DONE_WAITING_APPROVAL");
                      // Dispatch event for admin notification
                      setTimeout(() => {
                        window.dispatchEvent(
                          new CustomEvent("task-submitted-for-approval", {
                            detail: { title: title || (task && task.title) || "" },
                          })
                        );
                      }, 0);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-600 cursor-pointer font-bold text-sm hover:bg-orange-500/20 transition-colors"
                  >
                    {t("taskDrawer", "markDone")}
                  </button>
                )}

                {status === "DONE_WAITING_APPROVAL" && isAdmin && (
                  <>
                    <button
                      onClick={() => setStatus("APPROVED")}
                      className="px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 cursor-pointer font-bold text-sm hover:bg-emerald-500/20 transition-colors"
                    >
                      {t("taskDrawer", "approve")}
                    </button>
                    <button
                      onClick={() => setStatus("REJECTED")}
                      className="px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 cursor-pointer font-bold text-sm hover:bg-red-500/20 transition-colors"
                    >
                      {t("taskDrawer", "reject")}
                    </button>
                  </>
                )}

                {(status === "APPROVED" || status === "REJECTED") && (
                  <div className="text-sm text-muted-foreground italic">
                    {t("taskDrawer", "finalStatus")}: {status === "APPROVED" ? t("taskDrawer", "approvedStatus") : t("taskDrawer", "rejectedStatus")}
                  </div>
                )}
              </div>
              {!hasAfterPhoto && status === "IN_PROGRESS" && (
                <div className="text-xs font-bold text-amber-700 bg-amber-500/20 px-3 py-2 rounded-xl mt-1">
                  {t("taskDrawer", "afterPhotoHint", "Dodaj zdjęcie po wykonaniu prac, aby zgłosić zadanie do akceptacji.")}
                </div>
              )}
            </div>
          )}

          {/* ACTIONS */}
          <div className="flex gap-3 items-center pt-2">
            <button
              onClick={save}
              disabled={saving || uploading || !canSubmit}
              className="flex-1 px-4 py-3 rounded-xl border border-transparent bg-primary text-primary-foreground font-extrabold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {saving ? t("taskDrawer", "saving") : t("common", "save")}
            </button>

            <button
              onClick={onClose}
              disabled={saving || uploading}
              className="px-4 py-3 rounded-xl border border-border bg-background text-foreground font-extrabold hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("taskDrawer", "close")}
            </button>
          </div>

          <hr className="border-t border-border/50" />

          {/* PHOTOS */}
          <div className="grid gap-4">
            <div className="font-extrabold text-foreground">{t("taskDrawer", "photos")}</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="grid gap-1.5 text-xs font-bold text-foreground">
                <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "captionLabel")}</span>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all font-semibold" />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-foreground">
                <span className="opacity-70 uppercase tracking-wider">{t("taskDrawer", "photoPhase", "Rodzaj zdjęcia")}</span>
                <select
                  value={nextPhotoType}
                  onChange={(e) => setNextPhotoType(e.target.value as PhotoType)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                >
                  <option value="BEFORE">{t("taskDrawer", "photoPhaseBefore", "Przed pracą")}</option>
                  <option value="AFTER">{t("taskDrawer", "photoPhaseAfter", "Po pracy")}</option>
                </select>
              </label>

              <label className={`relative flex flex-col items-center justify-center gap-1 w-full h-[74px] rounded-xl border-2 border-dashed border-border hover:bg-muted/50 hover:border-primary/50 transition-all ${uploading || !canManagePhotos ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <span className="text-xl font-light leading-none">+</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{t("taskDrawer", "addPhoto")}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading || !canManagePhotos}
                  onChange={(e) => {
                    if (!canManagePhotos) return;
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
                        const ph = await uploadOne(taskId, f, caption.trim() === "" ? null : caption.trim(), nextPhotoType);
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
              <div className="grid gap-2">
                <div className="text-xs font-bold opacity-80">
                  {t("taskDrawer", "pendingPhotos")}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {pendingPhotos.map((p) => (
                    <div key={p.id} className="relative group">
                      <span
                        className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white z-10 shadow-sm ${p.photoType === "AFTER" ? "bg-emerald-500/90" : "bg-blue-500/90"
                          }`}
                      >
                        {p.photoType === "AFTER"
                          ? t("taskDrawer", "photoPhaseAfter", "Po pracy")
                          : t("taskDrawer", "photoPhaseBefore", "Przed pracą")}
                      </span>
                      <img
                        src={p.previewUrl}
                        alt=""
                        className="w-full h-24 object-cover rounded-xl border border-border bg-muted"
                      />
                      <button
                        onClick={() => removePending(p.id)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-foreground border border-black/10 flex items-center justify-center font-bold shadow-sm hover:bg-white hover:scale-105 transition-all text-xs"
                        title={t("common", "delete")}
                      >
                        ✕
                      </button>
                      {p.caption && (
                        <div className="mt-1 text-[11px] leading-tight opacity-80 break-words">{p.caption}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EDIT/CREATE: existing photos list */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="relative group">
                    <span
                      className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white z-10 shadow-sm ${(p.photo_type || "BEFORE") === "AFTER" ? "bg-emerald-500/90" : "bg-blue-500/90"
                        }`}
                    >
                      {(p.photo_type || "BEFORE") === "AFTER"
                        ? t("taskDrawer", "photoPhaseAfter", "Po pracy")
                        : t("taskDrawer", "photoPhaseBefore", "Przed pracą")}
                    </span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="block outline-none focus:ring-2 focus:ring-primary rounded-xl">
                      <img
                        src={p.url}
                        alt={p.caption || ""}
                        className="w-full h-24 object-cover rounded-xl border border-border bg-muted hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </a>
                    {canManagePhotos && (
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          if (!confirm(t("common", "confirmDelete", "Delete?"))) return;
                          try {
                            setUploading(true);
                            await apiDelete(`/api/task-photos?id=${p.id}`);
                            setPhotos((prev) => prev.filter((x) => x.id !== p.id));
                            window.dispatchEvent(new CustomEvent("task-photo-deleted", { detail: { photoId: p.id, taskId } }));
                          } catch (err: any) {
                            setErr(err.message || String(err));
                          } finally {
                            setUploading(false);
                          }
                        }}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-foreground border border-black/10 flex items-center justify-center font-bold shadow-sm hover:bg-white hover:scale-105 transition-all text-xs z-20"
                        title={t("common", "delete")}
                      >
                        ✕
                      </button>
                    )}
                    {p.caption && (
                      <div className="mt-1 text-[11px] leading-tight opacity-80 break-words">{p.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {photos.length === 0 && pendingPhotos.length === 0 && (
              <div className="text-xs text-muted-foreground italic">{t("taskDrawer", "photos")}: 0</div>
            )}

            {isCreate && pendingPhotos.length === 0 && (
              <div className="text-xs font-bold text-amber-800 bg-amber-500/20 px-3 py-2 rounded-xl">
                {t("taskDrawer", "beforePhotoMissing", "Brak zdjęcia dodaj")}
              </div>
            )}

            {!isCreate && !hasAfterPhoto && (
              <div className="text-xs font-bold text-amber-800 bg-amber-500/20 px-3 py-2 rounded-xl">
                {t("taskDrawer", "afterPhotoMissing", "Brak zdjęcia po wykonaniu prac.")}
              </div>
            )}
          </div>

          {/* COMMENTS */}
          {!isCreate && (
            <>
              <hr className="border-t border-border/50" />

              <div className="grid gap-4">
                <div className="text-sm font-extrabold text-foreground">{t("taskDrawer", "comments")} ({comments.length})</div>

                {/* Add comment input */}
                <div className="flex gap-2 items-end">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={t("taskDrawer", "addComment")}
                    className="flex-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[60px] resize-y"
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
                    className="px-4 py-2 rounded-xl border border-border bg-background text-foreground font-extrabold hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap h-[42px]"
                  >
                    {t("common", "save")}
                  </button>
                </div>

                {/* Comments list */}
                {comments.length > 0 && (
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-1">
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
                        <div key={c.id} className="p-3 rounded-xl border border-border bg-muted/30">
                          <div className="flex justify-between items-center mb-1.5">
                            <div className="font-bold text-xs text-foreground">{userName}</div>
                            <div className="text-[10px] text-muted-foreground">{timestamp}</div>
                          </div>
                          <div className="text-sm text-foreground whitespace-pre-wrap break-words">{c.comment}</div>
                          {renderTranslationSegment(makeTranslationKey("comment", c.id), c.comment)}
                        </div>
                      );
                    })}
                  </div>
                )}

                {comments.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">{t("taskDrawer", "noComments")}</div>
                )}
              </div>

              <hr className="border-t border-border/50" />

              <div className="grid gap-4">
                <div className="text-sm font-extrabold text-foreground">{t("taskDrawer", "history")}</div>

                {history.length > 0 ? (
                  <div className="grid gap-2 max-h-[260px] overflow-y-auto pr-1">
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
                      const historyMetaTemplate = t("taskDrawer", "historyMeta", "{date} • {user}");
                      const historyMeta = historyMetaTemplate
                        .replace("{date}", timestamp)
                        .replace("{user}", actorName);

                      return (
                        <div key={h.id} className="p-3 rounded-xl border border-border bg-muted/10">
                          <div className="text-xs font-bold text-foreground mb-1 whitespace-pre-wrap break-words">{action}</div>
                          <div className="text-[10px] text-muted-foreground">{historyMeta}</div>
                          {renderTranslationSegment(makeTranslationKey("history", h.id), action)}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">{t("taskDrawer", "noHistory", "No history yet")}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
