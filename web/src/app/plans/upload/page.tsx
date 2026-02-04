"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function PlansUploadPage() {
  const router = useRouter();

  const [projectId, setProjectId] = useState("55555555-5555-5555-5555-555555555555");
  const [floorId, setFloorId] = useState("77777777-7777-7777-7777-777777777777");
  const [version, setVersion] = useState<number>(4);
  const [file, setFile] = useState<File | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // lokalny URL do podglądu PDF przed uploadem
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

  const canSubmit = useMemo(() => !!file && !!projectId && !!floorId && !!version, [file, projectId, floorId, version]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!file) {
      setErr("Wybierz plik PDF.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("projectId", projectId);
      fd.append("floorId", floorId);
      fd.append("version", String(version));
      fd.append("file", file); // UWAGA: field name MUSI być "file"

      const r = await fetch("/api/plans/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || j?.error?.message || `Upload failed (${r.status})`);
      }

      const planId = j?.data?.id as string | undefined;
      setOk(`Wgrano OK. planId=${planId}`);

      // Po uploadzie idziemy od razu na /plan/:id
      // Tam PlanViewer pokaże PDF dopóki tiles/meta się zrobią.
      if (planId) router.push(`/plan/${planId}`);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Upload planu (PDF)</h1>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "420px 1fr", alignItems: "start" }}>
        {/* LEWA: formularz */}
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Project ID</span>
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ padding: 8 }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Floor ID</span>
            <input value={floorId} onChange={(e) => setFloorId(e.target.value)} style={{ padding: 8 }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Version</span>
            <input
              type="number"
              value={version}
              onChange={(e) => setVersion(parseInt(e.target.value || "0", 10))}
              style={{ padding: 8 }}
              min={1}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Plik PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            style={{
              padding: "10px 12px",
              cursor: busy ? "default" : "pointer",
              opacity: !canSubmit || busy ? 0.6 : 1,
            }}
          >
            {busy ? "Wysyłam..." : "Wyślij"}
          </button>

          {err && <div style={{ color: "crimson" }}>❌ {err}</div>}
          {ok && <div style={{ color: "green" }}>✅ {ok}</div>}

          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Tip: version musi być unikalny per (floor_id, version). Jak chcesz “nadpisywać”, zrobimy tryb update/upsert w backendzie.
          </div>
        </form>

        {/* PRAWA: podgląd PDF przed uploadem */}
        <div style={{ border: "1px solid #eee", borderRadius: 10, overflow: "hidden", minHeight: 520 }}>
          {!localPdfUrl ? (
            <div style={{ padding: 16, opacity: 0.7 }}>
              Wybierz plik PDF — tu pokaże się podgląd przed uploadem.
            </div>
          ) : (
            <iframe
              src={localPdfUrl}
              style={{ width: "100%", height: 720, border: 0, background: "#f3f3f3" }}
              title="PDF preview"
            />
          )}
        </div>
      </div>
    </div>
  );
}
