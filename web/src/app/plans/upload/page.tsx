"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
    <>
      <div className="home-hero upload-hero">
        <section className="home-hero-content upload-hero-content">
          <div className="home-hero-text">
            <div className="home-hero-kicker">Upload</div>
            <h1 className="home-hero-title">Upload planu (PDF)</h1>
            <p className="home-hero-subtitle">
              Dodaj nowy PDF, przypisz do projektu i piętra, a my wygenerujemy kafelki w tle.
            </p>
            <div className="home-hero-actions">
              <Link href="/plans" className="home-hero-secondary">
                Wróć do planów
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
            <h2>Nowy plan</h2>
            <p>Wypełnij formularz i sprawdź podgląd PDF przed uploadem.</p>
          </div>

          <div className="upload-grid">
            <form onSubmit={onSubmit} className="upload-form">
              <label className="upload-field">
                <span>Project ID</span>
                <input value={projectId} onChange={(e) => setProjectId(e.target.value)} />
              </label>

              <label className="upload-field">
                <span>Floor ID</span>
                <input value={floorId} onChange={(e) => setFloorId(e.target.value)} />
              </label>

              <label className="upload-field">
                <span>Version</span>
                <input
                  type="number"
                  value={version}
                  onChange={(e) => setVersion(parseInt(e.target.value || "0", 10))}
                  min={1}
                />
              </label>

              <label className="upload-field">
                <span>Plik PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>

              <button type="submit" disabled={!canSubmit || busy} className="upload-submit">
                {busy ? "Wysyłam..." : "Wyślij"}
              </button>

              {err && <div className="upload-error">❌ {err}</div>}
              {ok && <div className="upload-ok">✅ {ok}</div>}

              <div className="upload-tip">
                Tip: version musi być unikalny per (floor_id, version). Jak chcesz “nadpisywać”,
                zrobimy tryb update/upsert w backendzie.
              </div>
            </form>

            <div className="upload-preview">
              {!localPdfUrl ? (
                <div className="upload-empty">
                  Wybierz plik PDF — tu pokaże się podgląd przed uploadem.
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
