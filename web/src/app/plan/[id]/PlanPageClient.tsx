"use client";

import dynamic from "next/dynamic";

const PlanViewer = dynamic(() => import("@/components/PlanViewer"), {
  ssr: false,
  loading: () => <div style={{ padding: 16 }}>Loading viewer…</div>,
});

export default function PlanPageClient({ id }: { id: string }) {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Plan: {id}</h1>
      <PlanViewer planId={id} />
    </main>
  );
}
