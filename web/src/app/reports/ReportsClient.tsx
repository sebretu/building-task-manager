"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { useLanguage } from "@/contexts/LanguageContext";
import dynamic from "next/dynamic";
import { pdf } from "@react-pdf/renderer";
import ReportPdf from "./ReportPdf";

// No PDFViewer needed as we download directly

type Plan = {
    id: string;
    project_id: string;
    version: number;
    is_current: boolean;
    created_at: string;
    image_path: string;
    floor_id?: string;
    image_width?: number;
    image_height?: number;
    // We will add base64 data here
    imageBase64?: string;
};

type Project = {
    id: string;
    name: string;
};

type Building = {
    id: string;
    name: string;
};

type Floor = {
    id: string;
    name: string;
    building_id: string;
};

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE_WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
type PhotoMode = "BEFORE" | "AFTER" | "BOTH";

const ALL_STATUSES: TaskStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "DONE_WAITING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
];

// Helper to convert URL to Base64
const urlToBase64 = async (url: string): Promise<string | null> => {
    try {
        // Ensure we send cookies/credentials with the request
        const response = await fetch(url, { credentials: 'include' });
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Failed to convert image to base64", url, e);
        return null;
    }
}

export default function ReportsClient() {
    const { t } = useLanguage();
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>("");

    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

    const [buildings, setBuildings] = useState<Building[]>([]);
    const [floors, setFloors] = useState<Floor[]>([]);

    const [selectedStatuses, setSelectedStatuses] = useState<Set<TaskStatus>>(new Set(["OPEN", "IN_PROGRESS"]));

    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const [photoMode, setPhotoMode] = useState<PhotoMode>("BOTH");

    const [isGenerating, setIsGenerating] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");

    // Load Projects
    useEffect(() => {
        apiGet<Project[]>("/api/projects").then((data) => {
            setProjects(data || []);
            if (data && data.length > 0) {
                setSelectedProjectId(data[0].id);
            }
        }).catch(err => console.error("Failed to load projects", err));
    }, []);

    // Load Plans, Buildings, Floors when Project changes
    useEffect(() => {
        if (!selectedProjectId) {
            setPlans([]);
            setBuildings([]);
            setFloors([]);
            return;
        }

        // Fetch Plans
        apiGet<Plan[]>(`/api/plans?projectId=${selectedProjectId}&current=true`).then((data) => {
            setPlans(data || []);
            setSelectedPlanIds(new Set((data || []).map(p => p.id)));
        }).catch(err => console.error("Failed to load plans", err));

        // Fetch Buildings
        apiGet<Building[]>(`/api/buildings?projectId=${selectedProjectId}`).then((data) => {
            setBuildings(data || []);
        }).catch(err => console.error("Failed to load buildings", err));

        // Fetch Floors
        apiGet<Floor[]>(`/api/floors?projectId=${selectedProjectId}`).then((data) => {
            setFloors(data || []);
        }).catch(err => console.error("Failed to load floors", err));

    }, [selectedProjectId]);

    const handlePlanToggle = (planId: string) => {
        const next = new Set(selectedPlanIds);
        if (next.has(planId)) {
            next.delete(planId);
        } else {
            next.add(planId);
        }
        setSelectedPlanIds(next);
    };

    const handleStatusToggle = (status: TaskStatus) => {
        const next = new Set(selectedStatuses);
        if (next.has(status)) {
            next.delete(status);
        } else {
            next.add(status);
        }
        setSelectedStatuses(next);
    };

    const generateAndDownloadReport = async () => {
        setIsGenerating(true);
        setStatusMessage(t("reports", "loadingData", "Pobieranie danych..."));
        try {
            const query = new URLSearchParams({
                projectId: selectedProjectId,
                limit: "1000",
            });
            if (dateFrom) query.append("due_from", dateFrom);
            if (dateTo) query.append("due_to", dateTo);

            let allTasks: any[] = [];
            let offset = 0;
            const limit = 200;
            let more = true;

            while (more) {
                query.set("offset", offset.toString());
                query.set("limit", limit.toString());

                const res = await apiGet<any[]>(`/api/tasks?${query.toString()}`);
                if (!res || res.length === 0) {
                    more = false;
                } else {
                    allTasks = [...allTasks, ...res];
                    if (res.length < limit) more = false;
                    offset += limit;
                }
            }

            // Filter by selected plans and statuses
            const filtered = allTasks.filter(t =>
                selectedPlanIds.has(t.plan_id) &&
                selectedStatuses.has(t.status)
            );

            setStatusMessage(t("reports", "fetchingPhotos", "Pobieranie zdjęć..."));

            // Enrich with photo data based on photoMode
            // Also pre-fetch plan images as base64 to avoid authentication/white-page issues in PDF
            const enrichedTasks = await Promise.all(filtered.map(async (task) => {
                try {
                    let beforePhoto = null;
                    let afterPhoto = null;

                    if (photoMode === "BEFORE" || photoMode === "BOTH") {
                        const beforeRes = await apiGet<any[]>(`/api/task-photos?taskId=${task.id}&phase=BEFORE&limit=1`);
                        if (beforeRes && beforeRes.length > 0) {
                            // Fetch Base64
                            beforePhoto = await urlToBase64(beforeRes[0].url);
                        }
                    }

                    if (photoMode === "AFTER" || photoMode === "BOTH") {
                        const afterRes = await apiGet<any[]>(`/api/task-photos?taskId=${task.id}&phase=AFTER&limit=1`);
                        if (afterRes && afterRes.length > 0) {
                            // Fetch Base64
                            afterPhoto = await urlToBase64(afterRes[0].url);
                        }
                    }

                    return { ...task, beforePhoto, afterPhoto };
                } catch (err) {
                    console.warn(`Failed to fetch photos for task ${task.id}`, err);
                    return task;
                }
            }));

            // Pre-fetch Plan Images
            const enrichedPlans = await Promise.all(plans.map(async (plan) => {
                if (!selectedPlanIds.has(plan.id)) return plan;
                if (!plan.image_path) return plan;

                // image_path from API might be something like /api/tiles/static/... or direct URL.
                // We need to fetch it.
                const b64 = await urlToBase64(plan.image_path);
                return { ...plan, imageBase64: b64 || undefined };
            }));


            // Summary
            const byStatus: Record<string, number> = {};
            filtered.forEach(t => {
                byStatus[t.status] = (byStatus[t.status] || 0) + 1;
            });
            const summaryData = {
                total: filtered.length,
                byStatus
            };

            // Mapping for quick lookup (using enriched plans)
            const plansMap = enrichedPlans.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Plan>);
            const buildingsMap = buildings.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<string, Building>);
            const floorsMap = floors.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, Floor>);

            setStatusMessage(t("reports", "generating", "Generowanie PDF..."));

            // Prepare translations for PDF
            const pdfTranslations = {
                title: t("reports", "title", "Raporty"),
                project: t("reports", "project", "Projekt"),
                generatedOn: t("reports", "generatedOn", "Wygenerowano"),
                statuses: t("reports", "statuses", "Statusy"),
                from: t("home", "dueFrom", "Od"),
                to: t("home", "dueTo", "Do"),
                summary: t("reports", "summary", "Podsumowanie"),
                totalTasks: t("reports", "totalTasks", "Liczba zadań łącznie"),
                taskList: t("reports", "taskList", "Lista zadań"),
                number: t("reports", "number", "Nr"),
                name: t("reports", "name", "Nazwa"),
                assigned: t("reports", "assigned", "Przypisany"),
                dateCreated: t("reports", "dateCreated", "Data utw."),
                photos: t("reports", "photos", "Zdjęcia"),
                none: t("reports", "none", "Brak"),
                page: t("reports", "page", "Strona"),
                of: t("reports", "of", "z"),
                statusOpen: t("taskStatus", "OPEN", "Otwarte"),
                statusInProgress: t("taskStatus", "IN_PROGRESS", "W trakcie"),
                statusDoneWaiting: t("taskStatus", "DONE_WAITING_APPROVAL", "Czeka na akcept."),
                statusApproved: t("taskStatus", "APPROVED", "Zatwierdzone"),
                statusRejected: t("taskStatus", "REJECTED", "Odrzucone"),
                statusCancelled: "Anulowane",
            };

            // Generate PDF Blob
            const blob = await pdf(
                <ReportPdf
                    projectId={selectedProjectId}
                    projectName={projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}
                    planIds={Array.from(selectedPlanIds)}
                    statuses={Array.from(selectedStatuses)}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    plansMap={plansMap}
                    buildingsMap={buildingsMap}
                    floorsMap={floorsMap}
                    tasks={enrichedTasks}
                    summary={summaryData}
                    photoMode={photoMode}
                    translations={pdfTranslations}
                />
            ).toBlob();

            // Trigger Download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `raport_${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error("Error generating report", e);
            alert(t("common", "error", "Błąd") + ": " + (e as Error).message);
        } finally {
            setIsGenerating(false);
            setStatusMessage("");
        }
    };

    return (
        <main className="home-main upload-main">
            <section className="upload-panel">
                <div className="upload-header-centered">
                    <div>
                        <div className="home-hero-kicker">{t("reports", "title", "Raporty")}</div>
                        <h2>{t("reports", "generateTitle", "Generuj raport zadań (PDF)")}</h2>
                        <p>{t("reports", "selectParameters", "Wybierz parametry...")}</p>
                    </div>
                </div>

                {/* Remove grid layout, use simple flex column for vertical stacking */}
                <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div className="upload-card">

                        {/* Project Selector */}
                        <div className="upload-section">
                            <div className="upload-section-header">
                                <span className="upload-section-title">{t("reports", "project", "Projekt")}</span>
                            </div>
                            <div className="upload-field">
                                <select
                                    className="upload-select"
                                    value={selectedProjectId}
                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                >
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Plans Selector */}
                        <div className="upload-section">
                            <div className="upload-section-header">
                                <span className="upload-section-title">{t("reports", "selectPlans", "Wybierz plany")}</span>
                            </div>
                            <div className="upload-field">
                                <div className="border rounded p-2 max-h-60 overflow-y-auto bg-gray-50 flex flex-col gap-1">
                                    {plans.length === 0 && <span className="text-gray-400 text-sm">{t("reports", "noPlans", "Brak planów")}</span>}
                                    {plans.map(plan => {
                                        const floor = floors.find(f => f.id === plan.floor_id);
                                        const building = buildings.find(b => b.id === floor?.building_id);
                                        const label = `${building?.name || "?"} - ${floor?.name || "?"} (v${plan.version})`;
                                        return (
                                            <label key={plan.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPlanIds.has(plan.id)}
                                                    onChange={() => handlePlanToggle(plan.id)}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm">{label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-4 mt-2">
                                    <div className="text-xs text-blue-600 cursor-pointer" onClick={() => setSelectedPlanIds(new Set(plans.map(p => p.id)))}>{t("reports", "selectAll", "Zaznacz wszystkie")}</div>
                                    <div className="text-xs text-blue-600 cursor-pointer" onClick={() => setSelectedPlanIds(new Set())}>{t("reports", "deselectAll", "Odznacz wszystkie")}</div>
                                </div>
                            </div>
                        </div>

                        {/* Status Selector */}
                        <div className="upload-section">
                            <div className="upload-section-header">
                                <span className="upload-section-title">{t("reports", "statuses", "Statusy")}</span>
                            </div>
                            <div className="upload-field">
                                <div className="border rounded p-2 bg-gray-50 flex flex-col gap-1">
                                    {ALL_STATUSES.map(status => (
                                        <label key={status} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={selectedStatuses.has(status)}
                                                onChange={() => handleStatusToggle(status)}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm">{t("taskStatus", status, status)}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex gap-4 mt-2">
                                    <div className="text-xs text-blue-600 cursor-pointer" onClick={() => setSelectedStatuses(new Set(ALL_STATUSES))}>{t("reports", "selectAll", "Zaznacz wszystkie")}</div>
                                    <div className="text-xs text-blue-600 cursor-pointer" onClick={() => setSelectedStatuses(new Set())}>{t("reports", "deselectAll", "Odznacz wszystkie")}</div>
                                </div>
                            </div>
                        </div>

                        {/* Date Range */}
                        <div className="upload-section">
                            <div className="upload-section-header">
                                <span className="upload-section-title">{t("reports", "dateRange", "Zakres dat")}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="date"
                                    className="upload-input"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                                <input
                                    type="date"
                                    className="upload-input"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Photo Mode */}
                        <div className="upload-section">
                            <div className="upload-section-header">
                                <span className="upload-section-title">{t("reports", "photosInReport", "Zdjęcia w raporcie")}</span>
                            </div>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="photoMode" value="BOTH" checked={photoMode === "BOTH"} onChange={() => setPhotoMode("BOTH")} />
                                    <span className="text-sm">{t("reports", "bothPhotos", "Oba (Przed i Po)")}</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="photoMode" value="BEFORE" checked={photoMode === "BEFORE"} onChange={() => setPhotoMode("BEFORE")} />
                                    <span className="text-sm">{t("reports", "beforeOnly", "Tylko Przed")}</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="radio" name="photoMode" value="AFTER" checked={photoMode === "AFTER"} onChange={() => setPhotoMode("AFTER")} />
                                    <span className="text-sm">{t("reports", "afterOnly", "Tylko Po")}</span>
                                </label>
                            </div>
                        </div>


                        {/* Action */}
                        <div className="mt-8">
                            <button
                                onClick={generateAndDownloadReport}
                                disabled={selectedPlanIds.size === 0 || isGenerating}
                                className="upload-btn-primary w-full"
                                style={{ padding: "12px", fontSize: "16px" }}
                            >
                                {isGenerating ? statusMessage || t("reports", "generating", "Generowanie...") : t("reports", "downloadPdf", "Pobierz Raport PDF")}
                            </button>
                        </div>

                    </div>
                </div>
            </section>
        </main>
    );
}
