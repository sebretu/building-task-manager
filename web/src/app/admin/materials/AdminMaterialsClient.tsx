"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken, apiDelete, apiPut } from "@/lib/apiClient";
import Head from "next/head";

const LAST_CATEGORY_KEY = "adminMaterials_lastCategory";

interface Material {
    id: string;
    name: string;
    unit: string;
    category?: string | null;
}

interface MaterialCategory {
    id: string;
    name: string;
}

export default function AdminMaterialsClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [materials, setMaterials] = useState<Material[]>([]);
    const [categories, setCategories] = useState<MaterialCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("szt.");
    const [category, setCategory] = useState("");
    const [newCategoryName, setNewCategoryName] = useState("");
    const categoryInitialized = useRef(false);

    // Edit state (materials)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editUnit, setEditUnit] = useState("");
    const [editCategory, setEditCategory] = useState("");

    // Edit state (categories)
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");

    useEffect(() => {
        loadMaterials();
    }, []);

    // Pre-select last used category once categories are loaded
    useEffect(() => {
        if (!categoryInitialized.current && categories.length > 0) {
            categoryInitialized.current = true;
            const saved = localStorage.getItem(LAST_CATEGORY_KEY) ?? "";
            setCategory(saved);
        }
    }, [categories]);

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

            // Fetch categories
            const cats: MaterialCategory[] = await apiGet("/api/material-categories", token);
            setCategories(cats);
        } catch (err: any) {
            setError("Błąd ładowania: " + err.message);
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
            // keep category and unit - they are likely to be reused

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

    function startEditing(m: Material) {
        setEditingId(m.id);
        setEditName(m.name);
        setEditUnit(m.unit);
        setEditCategory(m.category || "");
    }

    async function handleUpdateMaterial(id: string) {
        if (!editName.trim() || !editUnit.trim()) {
            setError(t("common", "error", "Błąd") + ": Nazwa i jednostka są wymagane");
            return;
        }

        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            const updatedMaterial = await apiPut(`/api/materials`, {
                id,
                name: editName.trim(),
                unit: editUnit.trim(),
                category: editCategory.trim() || undefined
            }, token!);

            setMaterials(prev => prev.map(m => m.id === id ? updatedMaterial as Material : m).sort((a, b) => a.name.localeCompare(b.name)));
            setSuccess(t("common", "success", "Sukces"));
            setEditingId(null);
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(t("common", "error", "Błąd aktualizacji") + ": " + err.message);
        }
    }

    async function handleAddCategory(e: React.FormEvent) {
        e.preventDefault();
        if (!newCategoryName.trim()) return;

        setIsSubmittingCategory(true);
        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            const newCat = await apiPost("/api/material-categories", { name: newCategoryName.trim() }, token!);

            setCategories(prev => {
                const updated = [...prev, newCat as MaterialCategory];
                return updated.sort((a, b) => a.name.localeCompare(b.name));
            });
            setSuccess("Dodano kategorię pomyślnie.");
            setNewCategoryName("");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError("Błąd dodawania kategorii: " + err.message);
        } finally {
            setIsSubmittingCategory(false);
        }
    }

    async function handleDeleteCategory(id: string) {
        if (!confirm("Czy na pewno chcesz usunąć tę kategorię? Nie wpłynie to na przypisane już materiały, po prostu stracą kategorię jeśli nie zostaną zaktualizowane.")) return;

        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            await apiDelete(`/api/material-categories?id=${id}`, token!);
            setCategories(prev => prev.filter(c => c.id !== id));
            setCategory("");
            localStorage.setItem(LAST_CATEGORY_KEY, "");
            setSuccess(t("common", "success", "Sukces"));
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(t("common", "error", "Błąd usuwania") + ": " + err.message);
        }
    }

    async function handleRenameCategory(id: string) {
        const trimmed = editingCategoryName.trim();
        if (!trimmed) return;

        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();
            const updated = await apiPut("/api/material-categories", { id, name: trimmed }, token!);
            const updatedCat = updated as MaterialCategory;

            // Find old name before updating state
            const oldCat = categories.find(c => c.id === id);
            const oldName = oldCat?.name ?? "";

            setCategories(prev =>
                prev.map(c => c.id === id ? updatedCat : c).sort((a, b) => a.name.localeCompare(b.name))
            );

            // Update materials in local state that had the old category name
            setMaterials(prev =>
                prev.map(m => m.category === oldName ? { ...m, category: updatedCat.name } : m)
            );

            // Update persisted category if it was the renamed one
            if (category === oldName) {
                setCategory(updatedCat.name);
                localStorage.setItem(LAST_CATEGORY_KEY, updatedCat.name);
            }

            setEditingCategoryId(null);
            setSuccess("Zmieniono nazwę kategorii pomyślnie.");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError("Błąd zmiany nazwy kategorii: " + err.message);
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
        editTitle: t("adminMaterials", "editTitle", "Edytuj"),
        saveTitle: t("adminMaterials", "saveTitle", "Zapisz"),
        cancelTitle: t("adminMaterials", "cancelTitle", "Anuluj"),
    };

    return (
        <>
            <Head>
                <title>{txt.title} | InspectHero</title>
            </Head>

            <main className="home-main">
                <section className="home-task-panel">
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
                        <h3 style={{ margin: "0 0 16px 0", fontSize: 18 }}>{t("adminMaterials", "manageCategories", "Zarządzaj Kategoriami")}</h3>
                        <form onSubmit={handleAddCategory} style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    placeholder={t("adminMaterials", "newCategoryPlaceholder", "Nowa kategoria (np. Hydraulika)")}
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmittingCategory}
                                style={{
                                    background: "var(--secondary)", color: "#fff", border: "none",
                                    padding: "10px 20px", borderRadius: "var(--radius)",
                                    fontWeight: 600, cursor: isSubmittingCategory ? "not-allowed" : "pointer",
                                    opacity: isSubmittingCategory ? 0.7 : 1
                                }}
                            >
                                {isSubmittingCategory ? t("adminMaterials", "addingCategoryBtn", "Dodaję...") : t("adminMaterials", "addCategoryBtn", "Dodaj")}
                            </button>
                        </form>

                        {categories.length > 0 && (
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
                                {categories.map(c => (
                                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--home-bg-secondary)", padding: "4px 12px", borderRadius: "100px", fontSize: "14px", border: "1px solid var(--border)" }}>
                                        {editingCategoryId === c.id ? (
                                            <>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editingCategoryName}
                                                    onChange={e => setEditingCategoryName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") handleRenameCategory(c.id);
                                                        if (e.key === "Escape") setEditingCategoryId(null);
                                                    }}
                                                    style={{ border: "none", background: "transparent", outline: "1px solid var(--primary)", borderRadius: 4, padding: "2px 6px", fontSize: 14, minWidth: 80, maxWidth: 160 }}
                                                />
                                                <button
                                                    onClick={() => handleRenameCategory(c.id)}
                                                    title="Zapisz"
                                                    style={{ background: "transparent", border: "none", color: "var(--success)", cursor: "pointer", padding: "0 2px", fontWeight: "bold", fontSize: 16, lineHeight: 1 }}
                                                >✓</button>
                                                <button
                                                    onClick={() => setEditingCategoryId(null)}
                                                    title="Anuluj"
                                                    style={{ background: "transparent", border: "none", color: "var(--home-muted)", cursor: "pointer", padding: "0 2px", fontWeight: "bold", fontSize: 16, lineHeight: 1 }}
                                                >✕</button>
                                            </>
                                        ) : (
                                            <>
                                                <span>{c.name}</span>
                                                <button
                                                    onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }}
                                                    title="Edytuj nazwę"
                                                    style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", padding: "0 2px", fontSize: 13, lineHeight: 1 }}
                                                >✏️</button>
                                                <button
                                                    onClick={() => handleDeleteCategory(c.id)}
                                                    title="Usuń"
                                                    style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0 2px", fontWeight: "bold", fontSize: 16, lineHeight: 1 }}
                                                >×</button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

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
                                    <select
                                        className="upload-input"
                                        value={category}
                                        onChange={e => {
                                            setCategory(e.target.value);
                                            localStorage.setItem(LAST_CATEGORY_KEY, e.target.value);
                                        }}
                                    >
                                        <option value="">{t("adminMaterials", "noCategory", "-- Brak kategorii --")}</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
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
                            <div>
                                {(() => {
                                    // Group materials by category
                                    const grouped: Record<string, Material[]> = {};
                                    materials.forEach(m => {
                                        const cat = m.category || "Inne"; // "Inne" if no category
                                        if (!grouped[cat]) grouped[cat] = [];
                                        grouped[cat].push(m);
                                    });

                                    // Sort categories explicitly, bringing "Inne" to bottom mostly
                                    const sortedCategories = Object.keys(grouped).sort((a, b) => {
                                        if (a === "Inne") return 1;
                                        if (b === "Inne") return -1;
                                        return a.localeCompare(b);
                                    });

                                    return sortedCategories.map(cat => (
                                        <div key={cat} style={{ marginBottom: 32 }}>
                                            <h4 style={{
                                                margin: "0 0 12px 0",
                                                fontSize: 16,
                                                color: "var(--home-foreground)",
                                                background: "var(--home-bg-secondary)",
                                                padding: "10px 16px",
                                                borderRadius: "var(--radius)",
                                                borderLeft: "4px solid var(--primary)",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px"
                                            }}>
                                                {cat} <span style={{ fontSize: 13, color: "var(--home-muted)", fontWeight: "normal", background: "var(--home-bg)", padding: "2px 8px", borderRadius: "100px" }}>{grouped[cat].length}</span>
                                            </h4>
                                            <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--home-foreground)", fontSize: 14 }}>
                                                <tbody>
                                                    {grouped[cat].map(m => (
                                                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }} className="hover-bg-secondary">
                                                            {editingId === m.id ? (
                                                                <>
                                                                    <td style={{ padding: "8px 0", fontWeight: 500 }}>
                                                                        <input
                                                                            type="text"
                                                                            value={editName}
                                                                            onChange={(e) => setEditName(e.target.value)}
                                                                            className="upload-input"
                                                                            style={{ padding: "4px 8px", margin: 0 }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--home-muted)" }}>
                                                                        <input
                                                                            type="text"
                                                                            value={editUnit}
                                                                            onChange={(e) => setEditUnit(e.target.value)}
                                                                            className="upload-input"
                                                                            style={{ padding: "4px 8px", margin: 0, width: "80px", textAlign: "right" }}
                                                                        />
                                                                    </td>
                                                                    <td style={{ padding: "8px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                                                                        <button
                                                                            onClick={() => handleUpdateMaterial(m.id)}
                                                                            style={{ background: "transparent", border: "none", color: "var(--success)", cursor: "pointer", padding: "4px 8px", fontWeight: "bold" }}
                                                                            title={txt.saveTitle}
                                                                        >
                                                                            {txt.saveTitle}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditingId(null)}
                                                                            style={{ background: "transparent", border: "none", color: "var(--home-muted)", cursor: "pointer", padding: "4px 8px", fontWeight: "bold" }}
                                                                            title={txt.cancelTitle}
                                                                        >
                                                                            &times;
                                                                        </button>
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td style={{ padding: "8px 0", fontWeight: 500 }}>{m.name}</td>
                                                                    <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--home-muted)" }}>{m.unit}</td>
                                                                    <td style={{ padding: "8px 0", textAlign: "right", whiteSpace: "nowrap" }}>
                                                                        <button
                                                                            onClick={() => startEditing(m)}
                                                                            style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", padding: "4px 8px" }}
                                                                            title={txt.editTitle}
                                                                        >
                                                                            {txt.editTitle}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteMaterial(m.id)}
                                                                            style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "4px 8px" }}
                                                                            title={txt.deleteTitle}
                                                                        >
                                                                            {txt.deleteTitle}
                                                                        </button>
                                                                    </td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </>
    );
}
