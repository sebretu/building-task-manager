"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/apiClient";

const PlanViewer = dynamic(() => import("@/components/PlanViewer"), {
    ssr: false,
    loading: () => <div style={{ padding: 16 }}>Loading viewer…</div>,
});

type TaskCoords = {
    id: string;
    x_norm?: number | null;
    y_norm?: number | null;
};

export default function PlanPageClient({ id }: { id: string }) {
    const [title, setTitle] = useState(`Plan: ${id}`);
    const searchParams = useSearchParams();
    const focusTaskId = searchParams?.get("taskId") || null;
    const [focusPoint, setFocusPoint] = useState<{ x_norm: number; y_norm: number } | null>(null);

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

    // Fetch task coordinates for focusPoint when a taskId is provided via URL
    useEffect(() => {
        if (!focusTaskId) {
            setFocusPoint(null);
            return;
        }
        apiGet<{ ok: boolean; data: TaskCoords }>(`/api/task?id=${encodeURIComponent(focusTaskId)}`)
            .then((res: any) => {
                const task: TaskCoords = res?.data ?? res;
                if (
                    task &&
                    typeof task.x_norm === "number" &&
                    typeof task.y_norm === "number"
                ) {
                    setFocusPoint({ x_norm: task.x_norm, y_norm: task.y_norm });
                } else {
                    setFocusPoint(null);
                }
            })
            .catch(() => {
                setFocusPoint(null);
            });
    }, [focusTaskId]);

    return (
        <main style={{ padding: 16 }}>
            <h1 style={{ marginBottom: 12, fontSize: 20, fontWeight: 800 }}>{title}</h1>
            <PlanViewer
                planId={id}
                focusTaskId={focusTaskId}
                focusPoint={focusPoint}
                isQuestion={searchParams?.get("isQuestion") === "true"}
            />
        </main>
    );
}
