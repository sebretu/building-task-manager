"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiGet, getToken } from "@/lib/apiClient";
import Head from "next/head";

export default function AdminOrderEmailClient({ orderId }: { orderId: string }) {
    const router = useRouter();
    const { t } = useLanguage();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<any>(null);

    const [emailTo, setEmailTo] = useState("");
    const [emailSubject, setEmailSubject] = useState("Baumaterialien Bestellung");
    const [emailContent, setEmailContent] = useState("");
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        loadOrder();
    }, [orderId]);

    async function loadOrder() {
        try {
            setLoading(true);
            const token = await getToken();
            if (!token) {
                router.replace("/auth/login");
                return;
            }

            // We can fetch the specific order by using the GET endpoint we analyzed.
            // But wait, the GET endpoint can filter by project, we might just get all and filter locally
            // since there's no ?id= param. However, we can just use the GET /api/orders.
            // Wait, actually let's just fetch all orders and find this one, or better yet, create a specific api call if needed.
            // For admin, fetching all is fine.
            const resp = await fetch(`/api/orders`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const { data, ok, error } = await resp.json();

            if (!ok) throw new Error(error?.message || "Error fetching logic");

            const foundOrder = (data || []).find((o: any) => String(o.id) === String(orderId));
            if (!foundOrder) {
                throw new Error("Zamówienie nie zostało znalezione (" + orderId + ").");
            }

            setOrder(foundOrder);
            generateTemplate(foundOrder);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    function generateTemplate(o: any) {
        let lines: string[] = [];

        lines.push("Sehr geehrte Damen und Herren,");
        lines.push("");
        lines.push("ich möchte gerne folgende Materialien für morgen bestellen:");
        lines.push("");

        const items = o.items || [];
        items.forEach((item: any) => {
            const name = item.material ? item.material.name : item.custom_name;
            const unit = item.material ? item.material.unit : item.custom_unit;
            const qty = item.quantity;
            lines.push(`- ${name}  |  ${qty} ${unit}`);
        });

        lines.push("");
        lines.push("Falls etwas nicht vorrätig ist, bitte ich um Rückmeldung.");
        lines.push("Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.");
        lines.push("");
        lines.push("Mit freundlichen Grüßen,");
        lines.push("Marcin Słapiński");

        setEmailContent(lines.join("\n"));
    }

    async function handleSend() {
        if (!emailTo) {
            alert("Proszę podać adres e-mail.");
            return;
        }

        try {
            setIsSending(true);
            const token = await getToken();
            const htmlContent = emailContent.replace(/\n/g, "<br />");

            const res = await fetch("/api/send-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    to: emailTo,
                    subject: emailSubject,
                    html: htmlContent
                })
            });

            const data = await res.json();
            if (!data.ok) {
                throw new Error(data.error?.message || "Wystąpił błąd podczas wysyłania.");
            }

            alert("E-mail został pomyślnie wysłany ze strony!");
            router.push("/to-approve");
        } catch (err: any) {
            alert(err.message || "Błąd wysyłki.");
        } finally {
            setIsSending(false);
        }
    }

    if (loading) {
        return <div style={{ padding: 48, textAlign: "center" }}>{t("common", "loading", "Ładowanie...")}</div>;
    }

    return (
        <>
            <Head>
                <title>Wyślij E-mail | InspectHero</title>
            </Head>

            <main className="home-main">
                <section className="home-task-panel">
                    <button
                        onClick={() => router.push("/to-approve")}
                        style={{ background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 600, padding: 0, marginBottom: 16 }}
                    >
                        &larr; Wróć do listy
                    </button>

                    <div className="home-section-header">
                        <div>
                            <div className="home-hero-kicker">Admin</div>
                            <h2>Wyślij formalny e-mail</h2>
                            <p>Wygenerowana wiadomość w języku niemieckim (zamówienie materiałów).</p>
                        </div>
                    </div>

                    {error && <div className="home-card-error" style={{ marginBottom: 24 }}>{error}</div>}

                    <div className="upload-card" style={{ marginBottom: 32 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div>
                                <label className="upload-label">Adres e-mail hurtowni (Odbiorca)</label>
                                <input
                                    type="email"
                                    className="upload-input"
                                    value={emailTo}
                                    onChange={e => setEmailTo(e.target.value)}
                                    placeholder="hurtownia@example.com"
                                />
                            </div>

                            <div>
                                <label className="upload-label">Temat</label>
                                <input
                                    type="text"
                                    className="upload-input"
                                    value={emailSubject}
                                    onChange={e => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="upload-label">Treść wiadomości</label>
                                <textarea
                                    className="upload-input"
                                    value={emailContent}
                                    onChange={e => setEmailContent(e.target.value)}
                                    rows={15}
                                    style={{ resize: "vertical", fontFamily: "monospace", fontSize: "14px" }}
                                />
                            </div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                style={{
                                    background: isSending ? "#94a3b8" : "var(--primary)", color: "#fff", border: "none",
                                    padding: "12px 24px", borderRadius: "var(--radius)",
                                    fontWeight: 600, cursor: isSending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8
                                }}
                            >
                                {isSending ? "Wysyłanie..." : "✉️ Wyślij e-mail ze strony"}
                            </button>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}
