"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

type Company = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string | null;
};

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanySlug, setNewCompanySlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [newCompanyActive, setNewCompanyActive] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [deleteCompanyLoading, setDeleteCompanyLoading] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const { t } = useLanguage();
  const isAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";

  const handleAuthRedirect = useCallback(
    (message: string) => {
      const normalized = message.toLowerCase();
      if (
        normalized.includes("bearer token") ||
        normalized.includes("auth_required") ||
        normalized.includes("auth invalid")
      ) {
        router.replace("/auth/login");
        return true;
      }
      return false;
    },
    [router]
  );

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [companiesData, usersData] = await Promise.all([
        apiGet<Company[]>("/api/companies"),
        apiGet<User[]>("/api/users"),
      ]);
      setCompanies(companiesData || []);
      setUsers(usersData || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error loading data";
      if (handleAuthRedirect(message)) return;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [handleAuthRedirect]);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data?.session) {
          router.replace("/auth/login");
          return;
        }
        setCurrentUserId(data.session.user.id);
        setSessionChecked(true);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/auth/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!sessionChecked || !roleChecked) return;
    if (!isAdmin) return;
    loadData();
  }, [sessionChecked, roleChecked, isAdmin, loadData]);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    setRoleChecked(false);
    supabase
      .from("profiles")
      .select("role")
      .eq("id", currentUserId)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setCurrentUserRole(data?.role || "USER");
      })
      .catch(() => {
        if (!active) return;
        setCurrentUserRole("USER");
      })
      .finally(() => {
        if (!active) return;
        setRoleChecked(true);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (slugEdited) return;
    setNewCompanySlug(slugify(newCompanyName));
  }, [newCompanyName, slugEdited]);

  async function handleCreateCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;

    const trimmedName = newCompanyName.trim();
    if (!trimmedName) {
      setCompanyError("Nazwa firmy jest wymagana");
      return;
    }

    try {
      setCompanySaving(true);
      setCompanyError(null);
      const payload: Record<string, any> = {
        name: trimmedName,
        is_active: newCompanyActive,
      };
      if (newCompanySlug.trim()) {
        payload.slug = newCompanySlug.trim();
      }

      const created = await apiPost<Company>("/api/companies", payload);
      await loadData();
      setSelectedCompanyId(created.id);
      setNewCompanyName("");
      setNewCompanySlug("");
      setSlugEdited(false);
      setNewCompanyActive(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się utworzyć firmy";
      if (handleAuthRedirect(message)) return;
      setCompanyError(message);
    } finally {
      setCompanySaving(false);
    }
  }

  async function handleDeleteCompany(company: Company) {
    if (!isAdmin) return;
    if (!confirm(`Usunąć firmę ${company.name}? Członkowie zostaną odłączeni.`)) return;

    try {
      setDeleteCompanyLoading(true);
      setCompanyError(null);
      await apiDelete(`/api/companies?id=${encodeURIComponent(company.id)}`);
      await loadData();
      setSelectedCompanyId((prev) => (prev === company.id ? null : prev));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się usunąć firmy";
      if (handleAuthRedirect(message)) return;
      setCompanyError(message);
    } finally {
      setDeleteCompanyLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId || !selectedUserId) {
      alert("Wybierz firmę i użytkownika");
      return;
    }

    try {
      await apiPost(`/api/companies/${selectedCompanyId}/members`, {
        user_id: selectedUserId,
      });

      // Reload data
      await loadData();
      setShowAddUserModal(false);
      setSelectedUserId("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error adding user";
      if (handleAuthRedirect(message)) return;
      alert(message);
    }
  }

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);
  const companyMembers = selectedCompany
    ? users.filter((u) => u.company_id === selectedCompanyId)
    : [];
  const availableUsers = users.filter(
    (u) => !u.company_id || u.company_id === selectedCompanyId
  );

  if (!sessionChecked || !roleChecked) {
    return <div style={{ padding: 32 }}>{t("common", "loading", "Loading...")}</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{t("access", "adminOnlyTitle", "Access restricted")}</h1>
        <p style={{ fontSize: 16 }}>{t("access", "adminOnlyBody", "Only administrators can view this page.")}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>🏢 Firmy</h1>

      {error && (
        <div style={{ background: "#fee", color: "#c33", padding: "10px", borderRadius: "4px", marginBottom: "20px" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "20px" }}>
        {/* List of companies */}
        <div style={{ borderRight: "1px solid #eee", paddingRight: "20px" }}>
          {isAdmin && (
            <div style={{ marginBottom: "24px", padding: "16px", border: "1px solid #e0e0e0", borderRadius: "8px", background: "#f8f9fa" }}>
              <h3 style={{ marginTop: 0 }}>Dodaj firmę</h3>
              {companyError && (
                <div style={{ background: "#fff3cd", color: "#856404", padding: "8px", borderRadius: 4, marginBottom: 12 }}>
                  {companyError}
                </div>
              )}
              <form onSubmit={handleCreateCompany} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontSize: "13px", fontWeight: 600 }}>
                  Nazwa
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    style={{ width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: 4, marginTop: 4 }}
                    placeholder="Np. Elektro Sp. z o.o."
                  />
                </label>

                <label style={{ fontSize: "13px", fontWeight: 600 }}>
                  Slug
                  <input
                    type="text"
                    value={newCompanySlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setNewCompanySlug(e.target.value);
                    }}
                    style={{ width: "100%", padding: "8px", border: "1px solid #ccc", borderRadius: 4, marginTop: 4 }}
                    placeholder="np. elektro-sp"
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={newCompanyActive}
                    onChange={(e) => setNewCompanyActive(e.target.checked)}
                  />
                  Aktywna
                </label>

                <button
                  type="submit"
                  disabled={companySaving || !newCompanyName.trim()}
                  style={{
                    padding: "10px 14px",
                    background: companySaving ? "#6c757d" : "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: companySaving || !newCompanyName.trim() ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  {companySaving ? "Dodawanie..." : "Dodaj firmę"}
                </button>
              </form>
            </div>
          )}

          <h2>Lista firm</h2>
          {loading ? (
            <p>Ładowanie...</p>
          ) : companies.length === 0 ? (
            <p>Brak firm</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {companies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => setSelectedCompanyId(company.id)}
                  style={{
                    padding: "12px",
                    border:
                      selectedCompanyId === company.id
                        ? "2px solid #007bff"
                        : "1px solid #ccc",
                    borderRadius: "4px",
                    background:
                      selectedCompanyId === company.id ? "#e7f1ff" : "white",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight:
                      selectedCompanyId === company.id ? "bold" : "normal",
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#0d6efd" }}>{company.name}</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginTop: "4px",
                    }}
                  >
                    {company.is_active ? "✅ Aktywna" : "⏸️ Nieaktywna"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Company details */}
        <div>
          {selectedCompany ? (
            <div>
              <div style={{ marginBottom: "20px" }}>
                <h2>{selectedCompany.name}</h2>
                <p style={{ color: "#666" }}>
                  Slug: <code>{selectedCompany.slug}</code>
                </p>
                <p style={{ color: "#666" }}>
                  Status:{" "}
                  {selectedCompany.is_active ? (
                    <span style={{ color: "green" }}>✅ Aktywna</span>
                  ) : (
                    <span style={{ color: "gray" }}>⏸️ Nieaktywna</span>
                  )}
                </p>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteCompany(selectedCompany)}
                    disabled={deleteCompanyLoading}
                    style={{
                      padding: "8px 14px",
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: deleteCompanyLoading ? "not-allowed" : "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {deleteCompanyLoading ? "Usuwanie..." : "Usuń firmę"}
                  </button>
                )}
              </div>

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "15px",
                  }}
                >
                  <h3>Członkowie ({companyMembers.length})</h3>
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    style={{
                      padding: "8px 16px",
                      background: "#28a745",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    ➕ Dodaj użytkownika
                  </button>
                </div>

                {companyMembers.length === 0 ? (
                  <p style={{ color: "#999" }}>Brak członków w tej firmie</p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    {companyMembers.map((user) => (
                      <div
                        key={user.id}
                        style={{
                          padding: "12px",
                          border: "1px solid #eee",
                          borderRadius: "4px",
                          background: "#f9f9f9",
                        }}
                      >
                        <div style={{ fontWeight: "bold" }}>
                          {user.full_name}
                        </div>
                        <div style={{ fontSize: "12px", color: "#666" }}>
                          {user.email}
                        </div>
                        <div style={{ fontSize: "12px", marginTop: "4px" }}>
                          <span
                            style={{
                              background:
                                user.role === "ADMIN" ? "#ffc107" : "#e9ecef",
                              color: user.role === "ADMIN" ? "black" : "#666",
                              padding: "2px 6px",
                              borderRadius: "3px",
                            }}
                          >
                            {user.role}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p style={{ color: "#999" }}>Wybierz firmę, aby zobaczyć szczegóły</p>
          )}
        </div>
      </div>

      {/* Add user modal */}
      {showAddUserModal && selectedCompanyId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "white",
              padding: "30px",
              borderRadius: "8px",
              width: "100%",
              maxWidth: "400px",
            }}
          >
            <h2>➕ Dodaj użytkownika do firmy</h2>
            <form onSubmit={handleAddUser}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Użytkownik
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  required
                >
                  <option value="">-- Wybierz użytkownika --</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Dodaj
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
