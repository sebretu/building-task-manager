"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type Meta = {
  tileSize: number;
  minZoom: number;
  maxZoom: number;
  gridW: number;
  gridH: number;
  format?: string;
};

// Leaflet / PlanMap ładowany WYŁĄCZNIE w przeglądarce
const PlanMap = dynamic(() => import("./PlanMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 120px)",
        display: "grid",
        placeItems: "center",
        opacity: 0.75,
      }}
    >
      Ładuję mapę…
    </div>
  ),
});

export default function PlanViewer({
  planId,
  fullHeight = false,
  focusPoint,
  focusTaskId,
  allowCreate,
  currentUserId,
  currentUserRole,
}: {
  planId: string;
  fullHeight?: boolean;
  focusPoint?: { x_norm: number; y_norm: number } | null;
  focusTaskId?: string | null;
  allowCreate?: boolean;
  currentUserId?: string | null;
  currentUserRole?: string | null;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaStatus, setMetaStatus] = useState<
    "LOADING" | "PROCESSING" | "READY" | "ERROR"
  >("LOADING");
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const [viewerProfile, setViewerProfile] = useState<{ id: string; role: string | null } | null>(null);
  const [planProjectId, setPlanProjectId] = useState<string | null>(null);
  const [planProjectErr, setPlanProjectErr] = useState<string | null>(null);

  // --- polling meta.json ---
  useEffect(() => {
    let alive = true;
    let timer: any = null;

    setMeta(null);
    setMetaErr(null);
    setMetaStatus("LOADING");

    const tick = async () => {
      try {
        const r = await fetch(`/tiles/${planId}/meta.json`, {
          cache: "no-store",
        });

        // tiles jeszcze się generują → NORMALNY STAN
        if (r.status === 404) {
          if (!alive) return;
          setMetaStatus("PROCESSING");
          timer = setTimeout(tick, 1200);
          return;
        }

        if (!r.ok) {
          throw new Error(`meta.json fetch failed: ${r.status}`);
        }

        const j = (await r.json()) as Meta;

        if (
          typeof j.tileSize !== "number" ||
          typeof j.minZoom !== "number" ||
          typeof j.maxZoom !== "number" ||
          typeof j.gridW !== "number" ||
          typeof j.gridH !== "number"
        ) {
          throw new Error("meta.json ma zły format");
        }

        if (!alive) return;
        setMeta(j);
        setMetaStatus("READY");
      } catch (e: any) {
        if (!alive) return;
        setMetaStatus("ERROR");
        setMetaErr(e?.message || "meta load error");
      }
    };

    tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [planId]);

  useEffect(() => {
    let alive = true;
    setPlanProjectId(null);
    setPlanProjectErr(null);

    apiGet<{ project_id?: string | null }>(`/api/plan?id=${encodeURIComponent(planId)}`)
      .then((plan) => {
        if (!alive) return;
        setPlanProjectId(plan?.project_id || null);
      })
      .catch((err: any) => {
        if (!alive) return;
        setPlanProjectErr(err?.message || "Nie udało się pobrać projektu planu");
      });

    return () => {
      alive = false;
    };
  }, [planId]);

  useEffect(() => {
    if (currentUserId && currentUserRole) {
      setViewerProfile({ id: currentUserId, role: currentUserRole });
      return;
    }

    let alive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        const authId = data.session?.user?.id;
        if (!authId) {
          setViewerProfile(null);
          return;
        }
        supabase
          .from("profiles")
          .select("id, role")
          .eq("id", authId)
          .single()
          .then(({ data: profile }) => {
            if (!alive) return;
            setViewerProfile(profile || null);
          })
          .catch(() => {
            if (!alive) return;
            setViewerProfile(null);
          });
      })
      .catch(() => {
        if (!alive) return;
        setViewerProfile(null);
      });

    return () => {
      alive = false;
    };
  }, [currentUserId, currentUserRole]);

  const effectiveUserId = currentUserId ?? viewerProfile?.id ?? null;
  const effectiveUserRole = currentUserRole ?? viewerProfile?.role ?? null;
  const allowCreateResolved = typeof allowCreate === "boolean" ? allowCreate : !!effectiveUserId;

  // ------------------------------------------------------------------
  // 1) META JESZCZE NIE MA → POKAZUJ PDF (ZERO LEAFLET, ZERO SSR PROBLEMÓW)
  // ------------------------------------------------------------------
  const viewerHeight = fullHeight ? "100vh" : "calc(100vh - 120px)";
  const pdfHeight = fullHeight ? "calc(100vh - 72px)" : "60vh";

  if (metaStatus === "LOADING" || metaStatus === "PROCESSING") {
    return (
      <div
        style={{
          width: "100%",
          height: viewerHeight,
          display: "grid",
          gridTemplateRows: "auto 1fr",
        }}
      >
        <div style={{ padding: "10px 12px", fontSize: 12, opacity: 0.85 }}>
          <div style={{ fontWeight: 800 }}>Plan się przetwarza…</div>
          <div style={{ marginTop: 4 }}>
            Pokazuję PDF. Gdy tylko pojawi się <code>meta.json</code>, włączę
            zoom i tiles.
          </div>
          <div style={{ marginTop: 6, fontFamily: "monospace" }}>
            planId: {planId}
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <object
            data={`/api/plans/pdf?id=${encodeURIComponent(planId)}#view=FitH`}
            type="application/pdf"
            style={{ width: "100%", height: "100%", border: 0 }}
          >
            <div style={{ padding: 12 }}>
              Ten browser nie potrafi osadzić PDF.
              <div style={{ marginTop: 8 }}>
                <a
                  href={`/api/plans/pdf?id=${encodeURIComponent(planId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Otwórz PDF w nowej karcie
                </a>
              </div>
            </div>
          </object>
        </div>
      </div>
    );
  }

  // -----------------------
  // 2) META ERROR
  // -----------------------
  if (metaStatus === "ERROR") {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ color: "crimson", fontWeight: 700 }}>Błąd</div>
        <div style={{ marginTop: 6, fontFamily: "monospace" }}>{metaErr}</div>

        <div style={{ marginTop: 12, height: pdfHeight }}>
          <iframe
            title="Plan PDF"
            src={`/api/plans/pdf?id=${encodeURIComponent(planId)}#view=FitH`}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
      </div>
    );
  }

  // -----------------------
  // 3) READY → LEAFLET
  // -----------------------
  return (
    <PlanMap
      planId={planId}
      projectId={planProjectId}
      meta={meta!}
      fullHeight={fullHeight}
      focusPoint={focusPoint}
      focusTaskId={focusTaskId}
      allowCreate={allowCreateResolved}
      currentUserId={effectiveUserId}
      currentUserRole={effectiveUserRole}
      projectLoadError={planProjectErr}
    />
  );
}
