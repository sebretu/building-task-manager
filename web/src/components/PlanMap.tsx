"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import TaskDrawer from "./TaskDrawer";
import { apiGet } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTaskNumericLabel } from "@/lib/taskNumber";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
};

type TaskRow = {
  id: string;
  x_norm: number;
  y_norm: number;
  title: string;
  status?: string;
  assigned_user_id?: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string;
};

type TaskPhotoRow = {
  id: string;
  url: string;
  photo_type?: "BEFORE" | "AFTER" | null;
};

const CRS = L.CRS.Simple;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/images/marker-icon-2x.png",
  iconUrl: "/leaflet/images/marker-icon.png",
  shadowUrl: "/leaflet/images/marker-shadow.png",
});

function shortId(id: string) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function statusBadge(status?: string) {
  const s = (status || "OPEN").toUpperCase();
  const common: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid rgba(17,24,39,0.18)",
    background: "rgba(17,24,39,0.04)",
    color: "#111827",
    width: "fit-content",
  };

  if (s === "OPEN") return <span style={common}>🟦 OPEN</span>;
  if (s === "IN_PROGRESS") return <span style={common}>🟨 IN_PROGRESS</span>;
  if (s === "DONE_WAITING_APPROVAL") return <span style={common}>🟧 DONE</span>;
  if (s === "APPROVED") return <span style={common}>🟩 APPROVED</span>;
  if (s === "REJECTED") return <span style={common}>🟥 REJECTED</span>;
  return <span style={common}>{s}</span>;
}



export default function PlanMap({
  planId,
  projectId,
  meta,
  fullHeight = false,
  focusPoint,
  focusTaskId,
  allowCreate = true,
  currentUserId,
  currentUserRole,
  projectLoadError,
}: {
  planId: string;
  projectId: string | null;
  meta: Meta;
  fullHeight?: boolean;
  focusPoint?: { x_norm: number; y_norm: number } | null;
  focusTaskId?: string | null;
  allowCreate?: boolean;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  projectLoadError?: string | null;
}) {
  const START_ZOOM = 2;
  const FALLBACK_UPLOADED_BY = "44444444-4444-4444-4444-444444444444";
  const { t } = useLanguage();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [thumbByTask, setThumbByTask] = useState<Record<string, string | null>>({});
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const markerIconCache = useRef<Record<string, any>>({});

  // ✅ create-mode: klik w mapę -> draft, a task tworzy się dopiero po "Zapisz" w TaskDrawer
  const [createDraft, setCreateDraft] = useState<any>(null);

  // ⭐ profile cache
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const worldPxW = meta.gridW * meta.tileSize;
  const worldPxH = meta.gridH * meta.tileSize;

  const bounds = useMemo(() => {
    const sw = CRS.pointToLatLng(L.point(0, worldPxH), meta.maxZoom);
    const ne = CRS.pointToLatLng(L.point(worldPxW, 0), meta.maxZoom);
    return L.latLngBounds(sw, ne);
  }, [worldPxW, worldPxH, meta.maxZoom]);

  const center = bounds.getCenter();
  const focusLatLng = useMemo(() => {
    if (!focusPoint) return null;
    const p = L.point(focusPoint.x_norm * worldPxW, focusPoint.y_norm * worldPxH);
    return CRS.pointToLatLng(p, meta.maxZoom);
  }, [focusPoint, worldPxW, worldPxH, meta.maxZoom]);

  const MapContainerAny: any = MapContainer;

  const loadTasks = useCallback(async () => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    const search = new URLSearchParams({
      projectId,
      planId,
      limit: "200",
      offset: "0",
    });

    try {
      const data = await apiGet<TaskRow[]>(`/api/tasks?${search.toString()}`);
      setTasks(data || []);
    } catch {
      setTasks([]);
    }
  }, [projectId, planId]);

  // ⭐ pobierz profile 1x
  useEffect(() => {
    apiGet<ProfileRow[]>("/api/profiles?limit=1000")
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const p of rows || []) map[p.id] = p.full_name;
        setProfiles(map);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    loadTasks().catch(() => { });
  }, [loadTasks]);

  useEffect(() => {
    import("@/lib/apiClient").then(({ getToken }) => {
      getToken().then((t) => setToken(t));
    });
  }, []);

  async function loadThumb(taskId: string, phase: "BEFORE" | "AFTER") {
    const key = `${taskId}:${phase}`;
    try {
      const res = await apiGet<{ ok: boolean; data: TaskPhotoRow[] }>(`/api/task-photos?taskId=${encodeURIComponent(taskId)}&phase=${phase}&limit=1`);
      const photos = res?.data ?? [];
      const raw: string | null = photos.length > 0 ? (photos[0].url ?? null) : null;
      setThumbByTask((p) => ({ ...p, [key]: raw }));
    } catch {
      setThumbByTask((p) => ({ ...p, [key]: null }));
    }
  }

  function ensureThumb(taskId: string, status?: string) {
    const s = (status || "OPEN").toUpperCase();
    const phase = s === "APPROVED" ? "AFTER" : "BEFORE";
    const key = `${taskId}:${phase}`;
    if (Object.prototype.hasOwnProperty.call(thumbByTask, key)) return;
    loadThumb(taskId, phase).catch(() => { });
  }

  // ✅ PRZYWRÓCONE: klik w mapę otwiera drawer w trybie CREATE
  function ClickToCreate({ projectId, createdBy }: { projectId: string; createdBy: string }) {
    useMapEvents({
      click: (e: any) => {
        if (!projectId || !createdBy) return;
        const p = CRS.latLngToPoint(e.latlng, meta.maxZoom);

        const draft = {
          project_id: projectId,
          plan_id: planId,
          x_norm: p.x / worldPxW,
          y_norm: p.y / worldPxH,
          created_by: createdBy,
        };

        setDrawerTaskId(null);
        setCreateDraft(draft);
      },
    });
    return null;
  }

  // ✅ eventy z TaskDrawer: miniaturka + lista
  useEffect(() => {
    const onPhotoAdded = (e: any) => {
      const id = e?.detail?.taskId;
      if (!id) return;
      // Invalidate cache for this task so next click reloads
      setThumbByTask((prev) => {
        const next = { ...prev };
        // We don't know the phase easily here, so clear both potential keys
        delete next[`${id}:BEFORE`];
        delete next[`${id}:AFTER`];
        return next;
      });
      loadTasks().catch(() => { });
    };

    const onCreated = (e: any) => {
      const id = e?.detail?.taskId;
      if (!id) return;

      setCreateDraft(null);
      setDrawerTaskId(id);

      loadTasks().catch(() => { });
      // New task -> default phase BEFORE
      loadThumb(id, "BEFORE").catch(() => { });
    };

    window.addEventListener("task-photo-added", onPhotoAdded);
    window.addEventListener("task-saved", loadTasks as any);
    window.addEventListener("task-deleted", loadTasks as any);
    window.addEventListener("task-created", onCreated as any);

    return () => {
      window.removeEventListener("task-photo-added", onPhotoAdded);
      window.removeEventListener("task-saved", loadTasks as any);
      window.removeEventListener("task-deleted", loadTasks as any);
      window.removeEventListener("task-created", onCreated as any);
    };
  }, [loadTasks]);

  const mapHeight = fullHeight ? "100vh" : "calc(100vh - 120px)";

  const getIconForLabel = useCallback(
    (label: string) => {
      if (!label) return undefined;
      if (!markerIconCache.current[label]) {
        markerIconCache.current[label] = L.divIcon({
          className: "",
          html: `<div class="task-marker task-marker--map">${label}</div>`,
          iconSize: [56, 72],
          iconAnchor: [28, 58],
          popupAnchor: [0, -44],
        });
      }
      return markerIconCache.current[label];
    },
    []
  );

  function FocusOnTask({ target }: { target: any | null }) {
    const map = useMap();
    const focusZoom = Math.min(meta.maxZoom, Math.max(meta.minZoom, START_ZOOM + 1));

    useEffect(() => {
      if (!target) return;
      map.setView(target, focusZoom, { animate: true });
    }, [map, target, focusZoom]);

    return null;
  }

  return (
    <>
      <MapContainerAny
        crs={CRS}
        center={focusLatLng || center}
        zoom={Math.max(meta.minZoom, Math.min(meta.maxZoom, START_ZOOM))}
        minZoom={meta.minZoom}
        maxZoom={meta.maxZoom}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={1.0}
        style={{ height: mapHeight, background: "#fff" }}
      >
        {token && <TileLayer url={`/api/tiles/${planId}/{z}/{x}/{y}.png?token=${token}`} />}

        {allowCreate && projectId && currentUserId && <ClickToCreate projectId={projectId} createdBy={currentUserId} />}

        <FocusOnTask target={focusLatLng} />

        {tasks
          .filter((task) => (!focusTaskId ? true : task.id === focusTaskId))
          .map((task) => {
            const ll = CRS.pointToLatLng(L.point(task.x_norm * worldPxW, task.y_norm * worldPxH), meta.maxZoom);
            const status = (task.status || "OPEN").toUpperCase();
            const phase = status === "APPROVED" ? "AFTER" : "BEFORE";
            const thumb = thumbByTask[`${task.id}:${phase}`];
            const taskNumberLabel = getTaskNumericLabel(task.id);
            const markerIcon = getIconForLabel(taskNumberLabel);

            return (
              <Marker
                key={task.id}
                position={ll}
                // @ts-ignore
                icon={markerIcon ?? undefined}
                eventHandlers={{
                  click: () => {
                    ensureThumb(task.id, task.status);
                    // Nie otwieraj od razu drawera – niech otworzy się dymek (Popup).
                    // Drawer otworzy się dopiero po kliknięciu przycisku w dymku.
                  },
                }}
              >
                {/* react-leaflet Popup props typing differs across versions; ignore here */}
                {/* @ts-ignore */}
                <Popup autoPan closeButton offset={[0, 30]}>
                  <div style={{ width: 240, color: "#111827" }}>
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 10, display: "block" }}
                      />

                    ) : (
                      <div
                        style={{
                          height: 90,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0.7,
                          borderRadius: 10,
                          border: "1px dashed rgba(17,24,39,0.25)",
                        }}
                      >
                        Brak zdjęcia
                      </div>
                    )}

                    <div style={{ fontWeight: 900, marginTop: 8 }}>{task.title}</div>

                    <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                      {statusBadge(task.status)}
                      <div style={{ fontSize: 12 }}>
                        <b>Przydzielony:</b>{" "}
                        {task.assigned_user_id ? profiles[task.assigned_user_id] || shortId(task.assigned_user_id) : "—"}
                      </div>
                    </div>

                    <button
                      style={{
                        marginTop: 10,
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(17,24,39,0.25)",
                        background: "#fff",
                        color: "#111827",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                      onClick={() => {
                        setCreateDraft(null);
                        setDrawerTaskId(task.id);
                      }}
                    >
                      {t("planMap", "openTaskButton", "Open task")}
                    </button>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "rgba(17,24,39,0.7)",
                      }}
                    >
                      {t("planMap", "openTaskHint", "Click to expand the side panel")}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainerAny>

      {/* createDraft is accepted by TaskDrawer at runtime */}
      {/* @ts-ignore */}
      <TaskDrawer
        createDraft={createDraft}
        open={!!drawerTaskId || !!createDraft}
        taskId={drawerTaskId}
        uploadedBy={currentUserId || FALLBACK_UPLOADED_BY}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        onClose={() => {
          setDrawerTaskId(null);
          setCreateDraft(null);
        }}
      />

      {!projectId && projectLoadError && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(17,24,39,0.9)",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {projectLoadError}
        </div>
      )}
    </>
  );
}
