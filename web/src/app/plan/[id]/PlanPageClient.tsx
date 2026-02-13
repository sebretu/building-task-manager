"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";

const PlanViewer = dynamic(() => import("@/components/PlanViewer"), {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}>Loading viewer…</div>,
});

export default function PlanPageClient({ id }: { id: string }) {
    const [title, setTitle] = useState(`Plan: ${id}`);

    useEffect(() => {
        apiGet<any>(`/api/plan?id=${id}`).then((plan) => {
            if (plan) {
                const pName = plan.project?.name || "Projekt?";
                const bName = plan.floor?.building?.name || "Budynek?";
                const fName = plan.floor?.name || "Piętro?";
                setTitle(`${pName} - ${bName} - ${fName}`);
            }
        }).catch((err) => {
            console.error("Failed to load plan details for title", err);
        });
    }, [id]);

    return (
        <main style={{ padding: 16 }}>
            <h1 style={{ marginBottom: 12, fontSize: 20, fontWeight: 800 }}>{title}</h1>
            <PlanViewer planId={id} />
        </main>
    );
}
