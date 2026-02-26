"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken, apiDelete } from "@/lib/apiClient";
import Head from "next/head";

interface Material {
    id: string;
    name: string;
    unit: string;
    category?: string;
}

export default function AdminMaterialsClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("szt.");
    const [category, setCategory] = useState("");

    useEffect(() => {
        loadMaterials();
    }, []);

    async function loadMaterials() {
        try {
            const token = await getToken();
            if (!token) {
                router.replace("/auth/login");
                return;
            }

            // check role might be good here but backend enforces it anyway
            const data: Material[] = await apiGet("/api/materials", token);
            setMaterials(data);
        } catch (err: any) {
            setError("Błąd ładowania materiałów: " + err.message);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleAddMaterial(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !unit.trim()) {
            setError(t("common", "error", "Błąd") + ": Nazwa i jednostka są wymagane");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            const newMaterialData = await apiPost("/api/materials", {
                name: name.trim(),
                unit: unit.trim(),
                category: category.trim() || undefined
            }, token!);

            setMaterials(prev => [...prev, newMaterialData as Material].sort((a, b) => a.name.localeCompare(b.name)));
            setSuccess("Dodano materiał pomyślnie.");
            setName("");
            setCategory("");
            // keep unit as it might be reused often

            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError("Błąd dodawania: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleDeleteMaterial(id: string) {
        if (!confirm("Czy na pewno chcesz usunąć ten materiał?")) return;

        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            await apiDelete(`/api/materials?id=${id}`, token!);

            setMaterials(prev => prev.filter(m => m.id !== id));
            setSuccess(t("common", "success", "Sukces"));
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(t("common", "error", "Błąd usuwania") + ": " + err.message);
        }
    }

    if (isLoading) {
        return <div style={{ padding: 48, textAlign: "center" }}>{t("common", "loading", "Ładowanie...")}</div>;
    }

    const txt = {
        title: t("adminMaterials", "title", "Zarządzanie Materiałami"),
        subtitle: t("adminMaterials", "subtitle", "Dodawaj jednostki i nazwy..."),
        addMaterialTitle: t("adminMaterials", "addMaterialTitle", "Dodaj nowy materiał"),
        materialNameLabel: t("adminMaterials", "materialNameLabel", "Nazwa materiału *"),
        materialNamePlaceholder: t("adminMaterials", "materialNamePlaceholder", "Np. Płyta GK"),
        unitLabel: t("adminMaterials", "unitLabel", "Jednostka *"),
        unitPlaceholder: t("adminMaterials", "unitPlaceholder", "Np. szt., m2, kg"),
        categoryLabel: t("adminMaterials", "categoryLabel", "Kategoria (opcjonalnie)"),
        categoryPlaceholder: t("adminMaterials", "categoryPlaceholder", "Np. Elektryka"),
        addBtn: t("adminMaterials", "addBtn", "+ Dodaj materiał"),
        addingBtn: t("adminMaterials", "addingBtn", "Dodawanie..."),
        listTitle: t("adminMaterials", "listTitle", "Lista materiałów"),
        emptyList: t("adminMaterials", "emptyList", "Brak materiałów w bazie."),
        colName: t("adminMaterials", "colName", "Nazwa"),
        colCategory: t("adminMaterials", "colCategory", "Kategoria"),
        colUnit: t("adminMaterials", "colUnit", "Jednostka"),
        deleteTitle: t("adminMaterials", "deleteTitle", "Usuń"),
    };

    return (
        <>
            <Head>
                <title>{txt.title} | InspectHero</title>
            </Head>

            <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 64 }}>
                <div className="home-section-header">
                    <div>
                        <div className="home-hero-kicker">Admin</div>
                        <h2>{txt.title}</h2>
                        <p>{txt.subtitle}</p>
                    </div>
                </div>

                {error && <div className="home-card-error" style={{ marginBottom: 24 }}>{error}</div>}
                {success && (
                    <div style={{ padding: 16, background: "var(--success)", color: "#fff", borderRadius: "var(--radius)", marginBottom: 24 }}>
                        {success}
                    </div>
                )}

                <div className="upload-card" style={{ marginBottom: 32 }}>
                    <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>{txt.addMaterialTitle}</h3>
                    <form onSubmit={handleAddMaterial}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                            <div>
                                <label className="upload-label">{txt.materialNameLabel}</label>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={txt.materialNamePlaceholder}
                                    required
                                />
                            </div>
                            <div>
                                <label className="upload-label">{txt.unitLabel}</label>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={unit}
                                    onChange={e => setUnit(e.target.value)}
                                    placeholder={txt.unitPlaceholder}
                                    required
                                />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                                <label className="upload-label">{txt.categoryLabel}</label>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    placeholder={txt.categoryPlaceholder}
                                />
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                style={{
                                    background: "var(--primary)", color: "#fff", border: "none",
                                    padding: "10px 20px", borderRadius: "var(--radius)",
                                    fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer",
                                    opacity: isSubmitting ? 0.7 : 1
                                }}
                            >
                                {isSubmitting ? txt.addingBtn : txt.addBtn}
                            </button>
                        </div>
                    </form>
                </div>

                <div className="upload-card">
                    <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>{txt.listTitle} ({materials.length})</h3>
                    {materials.length === 0 ? (
                        <div style={{ padding: 32, textAlign: "center", color: "var(--home-muted)", background: "var(--home-bg-secondary)", borderRadius: "var(--radius)" }}>
                            {txt.emptyList}
                        </div>
                    ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--home-foreground)", fontSize: 14 }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--home-muted)" }}>
                                    <th style={{ textAlign: "left", padding: "12px 0", fontWeight: 500 }}>{txt.colName}</th>
                                    <th style={{ textAlign: "left", padding: "12px 16px", fontWeight: 500 }}>{txt.colCategory}</th>
                                    <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 500 }}>{txt.colUnit}</th>
                                    <th style={{ width: 40 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {materials.map(m => (
                                    <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover-bg-secondary">
                                        <td style={{ padding: "12px 0", fontWeight: 500 }}>{m.name}</td>
                                        <td style={{ padding: "12px 16px", color: "var(--home-muted)" }}>{m.category || "-"}</td>
                                        <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--home-muted)" }}>{m.unit}</td>
                                        <td style={{ padding: "12px 0", textAlign: "right" }}>
                                            <button
                                                onClick={() => handleDeleteMaterial(m.id)}
                                                style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4 }}
                                                title={txt.deleteTitle}
                                            >
                                                {txt.deleteTitle}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>
    );
}
