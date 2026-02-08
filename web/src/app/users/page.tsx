"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string | null;
  is_active: boolean;
  created_at: string;
};

type Company = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviteRole, setInviteRole] = useState("USER");
  const [inviteProjectId, setInviteProjectId] = useState("");
  const [inviteProjectRole, setInviteProjectRole] = useState("USER");
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("USER");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState("");
  const [editPasswordConfirm, setEditPasswordConfirm] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

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
      const [usersData, companiesData, projectsData] = await Promise.all([
        apiGet<User[]>("/api/users"),
        apiGet<Company[]>("/api/companies"),
        apiGet<Project[]>("/api/projects"),
      ]);
      setUsers(usersData || []);
      setCompanies(companiesData || []);
      setProjects(projectsData || []);
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
    if (!sessionChecked) return;
    loadData();
  }, [sessionChecked, loadData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail || !inviteName) {
      setInviteError("Email i imię są wymagane");
      return;
    }
    if (invitePassword !== invitePasswordConfirm) {
      setInviteError("Hasła muszą być takie same");
      return;
    }
    if (invitePassword.length < 8) {
      setInviteError("Hasło musi mieć minimum 8 znaków");
      return;
    }

    try {
      setInviteSaving(true);
      setInviteError(null);
      const payload: Record<string, any> = {
        email: inviteEmail,
        full_name: inviteName,
        company_id: inviteCompanyId || null,
        role: inviteRole,
        password: invitePassword,
      };

      if (inviteProjectId) {
        payload.project_id = inviteProjectId;
        payload.project_role = inviteProjectRole;
      }

      await apiPost<User>("/api/users", payload);

      await loadData();
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteName("");
      setInviteCompanyId("");
      setInviteRole("USER");
      setInviteProjectId("");
      setInviteProjectRole("USER");
      setInvitePassword("");
      setInvitePasswordConfirm("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Błąd podczas zapraszania";
      if (handleAuthRedirect(message)) return;
      setInviteError(message);
    } finally {
      setInviteSaving(false);
    }
  }

  function openEditModal(user: User) {
    setEditUser(user);
    setEditName(user.full_name);
    setEditRole(user.role);
    setEditCompanyId(user.company_id || "");
    setEditActive(user.is_active);
    setEditPassword("");
    setEditPasswordConfirm("");
    setEditError(null);
    setEditModalOpen(true);
  }

  function closeEditModal() {
    setEditModalOpen(false);
    setEditUser(null);
    setEditPassword("");
    setEditPasswordConfirm("");
    setConfirmingEmail(false);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;

    if (editPassword || editPasswordConfirm) {
      if (editPassword !== editPasswordConfirm) {
        setEditError("Hasła muszą być takie same");
        return;
      }
      if (editPassword.length < 8) {
        setEditError("Hasło musi mieć minimum 8 znaków");
        return;
      }
    }

    try {
      setEditSaving(true);
      setEditError(null);
      const updated = await apiPatch<User>("/api/users", {
        id: editUser.id,
        full_name: editName,
        role: editRole,
        company_id: editCompanyId || null,
        is_active: editActive,
        password: editPassword || undefined,
      });

      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      closeEditModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error updating user";
      if (handleAuthRedirect(message)) return;
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleConfirmEmail() {
    if (!editUser) return;
    try {
      setConfirmingEmail(true);
      setEditError(null);
      const updated = await apiPatch<User>("/api/users", {
        id: editUser.id,
        confirm_email: true,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditUser(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nie udało się potwierdzić emaila";
      if (handleAuthRedirect(message)) return;
      setEditError(message);
    } finally {
      setConfirmingEmail(false);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return "-";
    return companies.find((c) => c.id === companyId)?.name || "Unknown";
  };

  if (!sessionChecked) {
    return <div style={{ padding: 32 }}>Ładowanie...</div>;
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>👥 Użytkownicy</h1>

      {error && (
        <div style={{ background: "#fee", color: "#c33", padding: "10px", borderRadius: "4px", marginBottom: "20px" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="🔍 Szukaj użytkownika..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        />
        <button
          onClick={() => setShowInviteModal(true)}
          style={{
            padding: "10px 20px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          ➕ Zaproś użytkownika
        </button>
      </div>

      {loading ? (
        <p>Ładowanie...</p>
      ) : filteredUsers.length === 0 ? (
        <p>Brak użytkowników</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f5f5", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "12px", textAlign: "left" }}>Nazwa</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Email</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Rola</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Firma</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Status</th>
              <th style={{ padding: "12px", textAlign: "left" }}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "12px" }}>{user.full_name}</td>
                <td style={{ padding: "12px" }}>{user.email}</td>
                <td style={{ padding: "12px" }}>
                  <span
                    style={{
                      background: user.role === "ADMIN" ? "#ffc107" : "#e9ecef",
                      color: user.role === "ADMIN" ? "black" : "#666",
                      padding: "4px 8px",
                      borderRadius: "3px",
                      fontSize: "12px",
                    }}
                  >
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: "12px" }}>{getCompanyName(user.company_id)}</td>
                <td style={{ padding: "12px" }}>
                  {user.is_active ? (
                    <span style={{ color: "green" }}>✅ Aktywny</span>
                  ) : (
                    <span style={{ color: "gray" }}>⏸️ Nieaktywny</span>
                  )}
                </td>
                <td style={{ padding: "12px" }}>
                  <button
                    style={{
                      padding: "6px 12px",
                      background: "#6c757d",
                      color: "white",
                      border: "none",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                    onClick={() => openEditModal(user)}
                  >
                    Edytuj
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
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
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <h2>➕ Zaproś użytkownika</h2>
            {inviteError && (
              <div style={{ background: "#fee", color: "#c33", padding: "8px", borderRadius: 4, marginBottom: 12 }}>
                {inviteError}
              </div>
            )}
            <form onSubmit={handleInvite}>
              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Imię i nazwisko
                </label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Rola
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Hasło (min. 8 znaków)
                </label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Powtórz hasło
                </label>
                <input
                  type="password"
                  value={invitePasswordConfirm}
                  onChange={(e) => setInvitePasswordConfirm(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Firma (opcjonalnie)
                </label>
                <select
                  value={inviteCompanyId}
                  onChange={(e) => setInviteCompanyId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">-- Wybierz firmę --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                  Projekt (opcjonalnie)
                </label>
                <select
                  value={inviteProjectId}
                  onChange={(e) => setInviteProjectId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">-- Wybierz projekt --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {inviteProjectId && (
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                    Rola w projekcie
                  </label>
                  <select
                    value={inviteProjectRole}
                    onChange={(e) => setInviteProjectRole(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="USER">Członek</option>
                    <option value="MODERATOR">Moderator</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="submit"
                  disabled={inviteSaving}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: inviteSaving ? "#9dc7a7" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: inviteSaving ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {inviteSaving ? "Zapraszanie..." : "Zaproś"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteError(null);
                    setInvitePassword("");
                    setInvitePasswordConfirm("");
                    setInviteProjectId("");
                    setInviteProjectRole("USER");
                  }}
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

      {editModalOpen && editUser && (
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
              maxWidth: "420px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}
          >
            <h2>Edytuj użytkownika</h2>
            {editError && (
              <div style={{ background: "#fee", color: "#c33", padding: "8px", borderRadius: 4, marginBottom: 12 }}>
                {editError}
              </div>
            )}
            <form onSubmit={handleEditSubmit}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Imię i nazwisko</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4 }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Rola</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4 }}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Firma</label>
                <select
                  value={editCompanyId}
                  onChange={(e) => setEditCompanyId(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4 }}
                >
                  <option value="">-- Wybierz firmę --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                Aktywny
              </label>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Nowe hasło (opcjonalnie)</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Minimum 8 znaków"
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4 }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: 5, fontWeight: "bold" }}>Powtórz hasło</label>
                <input
                  type="password"
                  value={editPasswordConfirm}
                  onChange={(e) => setEditPasswordConfirm(e.target.value)}
                  style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 4 }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="submit"
                  disabled={editSaving}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: editSaving ? "#9dc7a7" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: editSaving ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                  }}
                >
                  {editSaving ? "Zapisywanie..." : "Zapisz"}
                </button>
                <button
                  type="button"
                  onClick={closeEditModal}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Anuluj
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmEmail}
                disabled={confirmingEmail}
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: "10px",
                  background: confirmingEmail ? "#d1d5db" : "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: confirmingEmail ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                }}
              >
                {confirmingEmail ? "Potwierdzanie..." : "Potwierdź email"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
