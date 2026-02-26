"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, apiPost, getToken } from "@/lib/apiClient";
import Head from "next/head";

interface Project {
    id: string;
    name: string;
}

interface Material {
    id: string;
    name: string;
    unit: string;
    category?: string;
}

interface CartItem {
    id: string; // internal temp id
    materialId?: string;
    name: string;
    unit: string;
    quantity: number;
}

export default function MaterialsClient() {
    const router = useRouter();
    const { t } = useLanguage();

    const [projects, setProjects] = useState<Project[]>([]);
    const [projectId, setProjectId] = useState<string>("");
    const [materials, setMaterials] = useState<Material[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [cart, setCart] = useState<CartItem[]>([]);

    // Custom material form state
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customName, setCustomName] = useState("");
    const [customUnit, setCustomUnit] = useState("szt.");
    const [customQty, setCustomQty] = useState<number | "">("");

    // Loading & Error states
    const [isLoading, setIsLoading] = useState(true);
    const [isSearching, setIsSearching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        if (searchQuery.trim().length >= 2) {
            searchMaterials(searchQuery);
        } else {
            setMaterials([]);
        }
    }, [searchQuery]);

    async function loadInitialData() {
        try {
            const token = await getToken();
            if (!token) {
                router.replace("/auth/login");
                return;
            }

            const projs: Project[] = await apiGet("/api/projects", token);
            setProjects(projs);

            // Try to auto-select a project if there's only one, or use local storage
            if (projs.length === 1) {
                setProjectId(projs[0].id);
            } else {
                const saved = localStorage.getItem("materials_project_id");
                if (saved && projs.some((p: Project) => p.id === saved)) {
                    setProjectId(saved);
                }
            }
        } catch (err: any) {
            setError("Failed to load projects: " + err.message);
        } finally {
            setIsLoading(false);
        }
    }

    async function searchMaterials(query: string) {
        setIsSearching(true);
        try {
            const token = await getToken();
            const results: Material[] = await apiGet(`/api/materials?search=${encodeURIComponent(query)}`, token!);
            setMaterials(results);
        } catch (err) {
            console.error("Failed to search materials", err);
        } finally {
            setIsSearching(false);
        }
    }

    function handleAddCatalogItem(mat: Material) {
        setCart(prev => {
            // If already in cart, increment quantity by 1
            const existing = prev.find(item => item.materialId === mat.id);
            if (existing) {
                return prev.map(item =>
                    item.materialId === mat.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                materialId: mat.id,
                name: mat.name,
                unit: mat.unit,
                quantity: 1
            }];
        });
        setSearchQuery("");
        setMaterials([]);
    }

    async function handleAddCustomItem() {
        if (!customName.trim() || !customUnit.trim() || !customQty || customQty <= 0) {
            alert(t("common", "error", "Błąd") + ": Wypełnij wszystkie pola");
            return;
        }

        try {
            const token = await getToken();
            // Auto-save to materials DB so it's searchable in future
            const savedMat = await apiPost<Material>("/api/materials", {
                name: customName.trim(),
                unit: customUnit.trim()
            }, token!);

            setCart(prev => {
                const existing = prev.find(item => item.materialId === savedMat.id);
                if (existing) {
                    return prev.map(item =>
                        item.materialId === savedMat.id
                            ? { ...item, quantity: item.quantity + Number(customQty) }
                            : item
                    );
                }
                return [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
                    materialId: savedMat.id,
                    name: savedMat.name,
                    unit: savedMat.unit,
                    quantity: Number(customQty)
                }];
            });
        } catch {
            // Fallback: add as pure custom (no materialId) if save fails
            setCart(prev => [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                name: customName.trim(),
                unit: customUnit.trim(),
                quantity: Number(customQty)
            }]);
        }

        setCustomName("");
        setCustomQty("");
        setShowCustomForm(false);
    }

    function handleRemoveItem(id: string) {
        setCart(prev => prev.filter(item => item.id !== id));
    }

    async function handleSubmitOrder() {
        if (!projectId) {
            setError(t("common", "error", "Błąd") + ": Wybierz projekt");
            return;
        }
        if (cart.length === 0) {
            setError(t("common", "error", "Błąd") + ": Koszyk jest pusty");
            return;
        }

        // Validate that all custom items have a non-empty name
        const emptyItems = cart.filter(item => !item.materialId && !item.name.trim());
        if (emptyItems.length > 0) {
            setError("Uzupełnij nazwy wszystkich pozycji w koszyku przed wysłaniem.");
            return;
        }

        setIsSubmitting(true);
        setError(null);
        setSuccess(null);

        try {
            const token = await getToken();

            // For any remaining custom items (no materialId), try to auto-save them first
            const resolvedCart = await Promise.all(cart.map(async item => {
                if (!item.materialId && item.name.trim()) {
                    try {
                        const savedMat = await apiPost<Material>("/api/materials", {
                            name: item.name.trim(),
                            unit: item.unit.trim() || "szt."
                        }, token!);
                        return { ...item, materialId: savedMat.id, name: savedMat.name, unit: savedMat.unit };
                    } catch {
                        return item; // keep as custom if save fails
                    }
                }
                return item;
            }));

            const payload = {
                projectId,
                items: resolvedCart.map(item => ({
                    materialId: item.materialId,
                    customName: item.materialId ? undefined : item.name,
                    customUnit: item.materialId ? undefined : item.unit,
                    quantity: item.quantity
                }))
            };

            await apiPost("/api/orders", payload, token!);

            setSuccess("Zapotrzebowanie zostało wysłane pomyślnie.");
            setCart([]);
            localStorage.setItem("materials_project_id", projectId);

            setTimeout(() => setSuccess(null), 5000);
        } catch (err: any) {
            setError("Błąd wysyłania: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    }

    if (isLoading) {
        return (
            <div style={{ padding: 48, textAlign: "center" }}>Ładowanie...</div>
        );
    }

    // Use translations if available, fallback to simple Polish for now
    const title = t("materials", "title", "Zapotrzebowanie");
    const subtitle = t("materials", "subtitle", "Zamów potrzebne materiały na budowę");
    const projectLabel = t("materials", "projectLabel", "Projekt");
    const searchLabel = t("materials", "searchLabel", "Szukaj materiału");
    const searchPlaceholder = t("materials", "searchPlaceholder", "Np. kabel, gniazdko...");
    const addCustomBtn = t("materials", "addCustomBtn", "Szukanego materiału nie ma na liście");
    const cartTitle = t("materials", "cartTitle", "Twój koszyk zapotrzebowań");
    const emptyCart = t("materials", "emptyCart", "Koszyk jest pusty. Dodaj materiały powyżej.");
    const submitBtn = t("materials", "submitBtn", "Wyślij zapotrzebowanie");

    return (
        <>
            <Head>
                <title>{title} | InspectHero</title>
            </Head>

            <div style={{ maxWidth: 800, margin: "0 auto", paddingBottom: 64 }}>
                <div className="home-section-header">
                    <div>
                        <div className="home-hero-kicker">Materiały</div>
                        <h2>{title}</h2>
                        <p>{subtitle}</p>
                    </div>
                </div>

                {error && <div className="home-card-error" style={{ marginBottom: 24 }}>{error}</div>}
                {success && (
                    <div style={{ padding: 16, background: "var(--success)", color: "#fff", borderRadius: "var(--radius)", marginBottom: 24 }}>
                        {success}
                    </div>
                )}

                <div className="upload-card">
                    {/* Project Selection */}
                    <div className="upload-section">
                        <div className="upload-field" style={{ marginBottom: 24 }}>
                            <label className="upload-label">{projectLabel}</label>
                            <div className="upload-input-group">
                                <select
                                    className="upload-select"
                                    value={projectId}
                                    onChange={(e) => {
                                        setProjectId(e.target.value);
                                        localStorage.setItem("materials_project_id", e.target.value);
                                    }}
                                    disabled={projects.length === 0}
                                >
                                    <option value="" disabled>-- {t("materials", "projectLabel", "Wybierz projekt")} --</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Material Search */}
                        <div className="upload-field" style={{ position: "relative" }}>
                            <label className="upload-label">{searchLabel}</label>
                            <div className="upload-input-group">
                                <input
                                    type="text"
                                    className="upload-input"
                                    placeholder={searchPlaceholder}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Dropdown Results */}
                            {searchQuery.length >= 2 && (
                                <div style={{
                                    position: "relative", zIndex: 10,
                                    background: "var(--home-bg)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", marginTop: 8, maxHeight: 300, overflowY: "auto"
                                }}>
                                    {isSearching ? (
                                        <div style={{ padding: 12, color: "var(--home-muted)" }}>{t("common", "loading", "Szukanie...")}</div>
                                    ) : materials.length > 0 ? (
                                        materials.map(mat => (
                                            <div
                                                key={mat.id}
                                                onClick={() => handleAddCatalogItem(mat)}
                                                style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}
                                                className="hover-bg-secondary"
                                            >
                                                <span style={{ fontWeight: 500, color: "var(--home-foreground)" }}>{mat.name}</span>
                                                <span style={{ color: "var(--home-muted)", fontSize: 13 }}>{mat.unit}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: 12, color: "var(--home-muted)" }}>{t("adminMaterials", "emptyList", "Brak wyników w bazie.")}</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {!showCustomForm && (
                            <button
                                onClick={() => setShowCustomForm(true)}
                                style={{
                                    background: "var(--home-bg-secondary)",
                                    border: "1px dashed var(--border)",
                                    color: "var(--home-foreground)",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                    fontSize: 14,
                                    marginTop: 16,
                                    padding: "12px",
                                    width: "100%",
                                    borderRadius: "var(--radius)",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 8,
                                    transition: "background 0.2s"
                                }}
                                className="hover-bg-secondary"
                            >
                                <span style={{ fontSize: 18, fontWeight: 300, color: "var(--primary)" }}>+</span> {addCustomBtn}
                            </button>
                        )}

                        {showCustomForm && (
                            <div style={{ marginTop: 16, padding: 16, borderRadius: "var(--radius)", background: "var(--home-bg-secondary)", border: "1px dashed var(--border)" }}>
                                <h4 style={{ margin: "0 0 12px 0", color: "var(--home-foreground)", fontSize: 14 }}>{t("adminMaterials", "addMaterialTitle", "Dodaj pozycję ręcznie")}</h4>
                                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, alignItems: "end" }}>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("adminMaterials", "materialNameLabel", "Nazwa materiału")}</label>
                                        <input type="text" className="upload-input" value={customName} onChange={e => setCustomName(e.target.value)} placeholder={t("adminMaterials", "materialNamePlaceholder", "Np. Przełącznik typ X")} />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("adminMaterials", "unitLabel", "Jednostka")}</label>
                                        <input type="text" className="upload-input" value={customUnit} onChange={e => setCustomUnit(e.target.value)} placeholder={t("adminMaterials", "unitPlaceholder", "szt., mb")} />
                                    </div>
                                    <div>
                                        <label style={{ display: "block", fontSize: 12, color: "var(--home-muted)", marginBottom: 4 }}>{t("materials", "quantityCol", "Ilość")}</label>
                                        <input type="number" min="0.01" step="0.01" className="upload-input" value={customQty} onChange={e => setCustomQty(e.target.value ? Number(e.target.value) : "")} placeholder="0" />
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
                                    <button onClick={() => setShowCustomForm(false)} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--home-foreground)", padding: "6px 16px", borderRadius: "var(--radius)", cursor: "pointer" }}>{t("common", "cancel", "Anuluj")}</button>
                                    <button onClick={handleAddCustomItem} style={{ background: "var(--primary)", border: "none", color: "#fff", padding: "6px 16px", borderRadius: "var(--radius)", cursor: "pointer", fontWeight: 600 }}>{t("adminMaterials", "addBtn", "Dodaj do koszyka")}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cart */}
                <div className="upload-card" style={{ marginTop: 24 }}>
                    <div className="upload-section">
                        <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "var(--home-foreground)" }}>{cartTitle}</h3>

                        {cart.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center", color: "var(--home-muted)", background: "var(--home-bg-secondary)", borderRadius: "var(--radius)", border: "1px dashed var(--border)" }}>
                                {emptyCart}
                            </div>
                        ) : (
                            <div>
                                <table style={{ width: "100%", borderCollapse: "collapse", color: "var(--home-foreground)", fontSize: 14 }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--home-muted)" }}>
                                            <th style={{ textAlign: "left", padding: "12px 0", fontWeight: 500 }}>{t("materials", "materialCol", "Materiał")}</th>
                                            <th style={{ textAlign: "right", padding: "12px 16px", fontWeight: 500, whiteSpace: "nowrap" }}>{t("materials", "quantityCol", "Menge / Ilość")}</th>
                                            <th style={{ width: 40 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cart.map(item => (
                                            <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                                <td style={{ padding: "10px 0", fontWeight: 500 }}>
                                                    {/* Editable name only for custom (non-catalog) items */}
                                                    {item.materialId ? (
                                                        <span>
                                                            {item.name}
                                                        </span>
                                                    ) : (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                            <input
                                                                type="text"
                                                                value={item.name}
                                                                onChange={e => setCart(prev => prev.map(ci =>
                                                                    ci.id === item.id ? { ...ci, name: e.target.value } : ci
                                                                ))}
                                                                style={{
                                                                    border: "1px solid var(--border)",
                                                                    borderRadius: "var(--radius)",
                                                                    padding: "4px 8px",
                                                                    fontSize: 13,
                                                                    background: "var(--home-bg-secondary)",
                                                                    color: "var(--home-foreground)",
                                                                    width: "100%",
                                                                    maxWidth: 280
                                                                }}
                                                                placeholder={t("adminMaterials", "materialNamePlaceholder", "Nazwa materiału")}
                                                            />
                                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                                <input
                                                                    type="text"
                                                                    value={item.unit}
                                                                    onChange={e => setCart(prev => prev.map(ci =>
                                                                        ci.id === item.id ? { ...ci, unit: e.target.value } : ci
                                                                    ))}
                                                                    style={{
                                                                        border: "1px solid var(--border)",
                                                                        borderRadius: "var(--radius)",
                                                                        padding: "4px 8px",
                                                                        fontSize: 12,
                                                                        background: "var(--home-bg-secondary)",
                                                                        color: "var(--home-muted)",
                                                                        width: 72
                                                                    }}
                                                                    placeholder={t("adminMaterials", "unitPlaceholder", "Jedn.")}
                                                                />
                                                                <span style={{ fontSize: 11, background: "var(--border)", padding: "2px 6px", borderRadius: 4, color: "var(--home-muted)" }}>
                                                                    {t("materials", "customBadge", "Ręcznie")}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: "10px 16px", textAlign: "right" }}>
                                                    {/* Editable quantity for ALL items */}
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                                        <input
                                                            type="number"
                                                            min="0.01"
                                                            step="0.01"
                                                            value={item.quantity}
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value.replace(",", "."));
                                                                if (!isNaN(val) && val > 0) {
                                                                    setCart(prev => prev.map(ci =>
                                                                        ci.id === item.id ? { ...ci, quantity: val } : ci
                                                                    ));
                                                                }
                                                            }}
                                                            style={{
                                                                width: 72,
                                                                border: "1px solid var(--border)",
                                                                borderRadius: "var(--radius)",
                                                                padding: "4px 8px",
                                                                fontSize: 14,
                                                                textAlign: "right",
                                                                background: "var(--home-bg-secondary)",
                                                                color: "var(--home-foreground)",
                                                                fontWeight: 600
                                                            }}
                                                        />
                                                        <span style={{ color: "var(--home-muted)", fontSize: 13, minWidth: 28 }}>{item.unit}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: "10px 0", textAlign: "right" }}>
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: 4 }}
                                                        title={t("common", "delete", "Usuń")}
                                                    >
                                                        ✖️
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Add extra custom item directly in cart */}
                                <div style={{ marginTop: 16 }}>
                                    <button
                                        onClick={() => {
                                            setCart(prev => [...prev, {
                                                id: Math.random().toString(36).substr(2, 9),
                                                name: "",
                                                unit: "szt.",
                                                quantity: 1
                                            }]);
                                        }}
                                        style={{
                                            background: "transparent",
                                            border: "1px dashed var(--border)",
                                            color: "var(--home-muted)",
                                            cursor: "pointer",
                                            fontSize: 13,
                                            padding: "8px 16px",
                                            borderRadius: "var(--radius)",
                                            width: "100%",
                                            textAlign: "center",
                                            transition: "background 0.2s"
                                        }}
                                        className="hover-bg-secondary"
                                    >
                                        + {t("materials", "addCustomBtn", "Dodaj pozycję do listy")}
                                    </button>
                                </div>

                                <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                                    <button
                                        onClick={handleSubmitOrder}
                                        disabled={isSubmitting || !projectId}
                                        style={{
                                            background: "var(--primary)",
                                            color: "#fff",
                                            border: "none",
                                            padding: "12px 24px",
                                            borderRadius: "var(--radius)",
                                            fontSize: 16,
                                            fontWeight: 600,
                                            cursor: isSubmitting || !projectId ? "not-allowed" : "pointer",
                                            opacity: isSubmitting || !projectId ? 0.7 : 1
                                        }}
                                    >
                                        {isSubmitting ? t("common", "loading", "Wysyłanie...") : submitBtn}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
