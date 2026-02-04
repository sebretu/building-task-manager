"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import TaskDrawer from "@/components/TaskDrawer";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default function TaskClient({ id }: { id: string }) {
  const router = useRouter();

  const okId = useMemo(() => (typeof id === "string" ? id.trim() : ""), [id]);

  // DEV: na razie na sztywno (tak jak wcześniej w mapie)
  const UPLOADED_BY = "44444444-4444-4444-4444-444444444444";

  // Jeśli route jest zła – pokaż czytelny komunikat zamiast pustego drawera
  if (!okId || !isUuid(okId)) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui", color: "#111827" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Task</div>
        <div style={{ marginTop: 8, opacity: 0.8 }}>Brak / nieprawidłowe ID w URL.</div>
        <div style={{ marginTop: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
          id: {String(id)}
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ← Wróć
        </button>
      </div>
    );
  }

  return (
    <TaskDrawer
      open={true}
      taskId={okId}
      uploadedBy={UPLOADED_BY}
      onClose={() => router.back()}
    />
  );
}
