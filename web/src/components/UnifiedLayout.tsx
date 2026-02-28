"use client";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNotification } from "@/contexts/NotificationContext";
import Link from "next/link";
import styles from "./UnifiedLayout.module.css";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogoutButton } from "@/components/LogoutButton";


import { supabase } from "@/lib/supabase";

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showNotification } = useNotification();
  const hideChrome = pathname?.startsWith("/task/");
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminDropdownOpen, setAdminDropdownOpen] = useState(false);
  const adminDropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const footerTagline = t("footer", "tagline", "Inspection and reporting platform");
  const [userRole, setUserRole] = useState<string | null>(null);
  const isAdmin = (userRole || "").toUpperCase() === "ADMIN";

  // Load role via /api/me (no direct profiles query in browser)
  useEffect(() => {
    let alive = true;

    async function loadRole(sessionToken?: string | null) {
      try {
        const token = sessionToken || (await supabase.auth.getSession()).data.session?.access_token;
        console.log("[UnifiedLayout] loadRole token?", !!token);

        if (!token) {
          if (alive) setUserRole(null);
          return;
        }

        const isMobile = process.env.NEXT_PUBLIC_PLATFORM === 'mobile';
        const url = isMobile ? 'https://api.inspecthero.pl/api/me' : '/api/me';
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        console.log("[UnifiedLayout] /api/me status", r.status);

        if (!r.ok) {
          if (alive) setUserRole(null);
          return;
        }

        const j = await r.json();
        console.log("[UnifiedLayout] role =", j?.profile?.role);

        if (alive) setUserRole(j?.profile?.role || "USER");
      } catch (e) {
        console.warn("[UnifiedLayout] loadRole failed", e);
        if (alive) setUserRole(null);
      }
    }

    // initial
    loadRole(null);

    // update on auth changes
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadRole(session?.access_token || null);
    });

    return () => {
      alive = false;
      sub.subscription?.unsubscribe();
    };
  }, []);

  // Handle clicking outside Admin Dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(event.target as Node)) {
        setAdminDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Listen for task submitted for approval event (depends on role)
  useEffect(() => {
    function handleTaskSubmitted(e: any) {
      if ((userRole || "").toUpperCase() === "ADMIN") {
        const taskTitle = e?.detail?.title || "";
        showNotification(
          taskTitle ? `Zadanie "${taskTitle}" zgłoszone do akceptacji.` : "Zadanie zgłoszone do akceptacji.",
          "info"
        );
      }
    }

    window.addEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
    return () => {
      window.removeEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
    };
  }, [userRole, showNotification]);

  // Listen for task submitted for approval event (depends on role)
  useEffect(() => {
    function handleTaskSubmitted(e: any) {
      if ((userRole || "").toUpperCase() === "ADMIN") {
        const taskTitle = e?.detail?.title || "";
        showNotification(
          taskTitle ? `Zadanie "${taskTitle}" zgłoszone do akceptacji.` : "Zadanie zgłoszone do akceptacji.",
          "info"
        );
      }
    }

    window.addEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
    return () => {
      window.removeEventListener("task-submitted-for-approval", handleTaskSubmitted as any);
    };
  }, [userRole, showNotification]);



  const navLinks = useMemo(() => {
    const links = [
      { href: "/", label: t("nav", "tasks", "Zadania") },
      { href: "/plans", label: t("nav", "plans", "Plany") },
      { href: "/materials", label: t("nav", "materials", "Zapotrzebowania") },
    ];
    if (!isAdmin) {
      links.push({ href: "/questions", label: t("nav", "questions", "Pytania") });
    }
    return links;
  }, [t, isAdmin]);

  const adminLinks = useMemo(() => {
    if (!isAdmin) return [];
    return [
      { href: "/users", label: t("nav", "users", "Użytkownicy") },
      { href: "/companies", label: t("nav", "companies", "Firmy") },
      { href: "/reports", label: t("nav", "reports", "Raporty") },
      { href: "/to-approve", label: t("nav", "toApprove", "Do zatwierdzenia") },
      { href: "/completed", label: t("nav", "completed", "Zakończone prace") },
      { href: "/admin/materials", label: t("nav", "adminMaterials", "Materiały (Admin)") },
      { href: "/plans/upload", label: t("nav", "adminUploadPlan", "Upload plan") },
    ];
  }, [t, isAdmin]);

  if (hideChrome) {
    // Task preview uses its own fullscreen chrome and should not show the global navigation.
    return <>{children}</>;
  }

  return (
    <div className={styles.layoutRoot}>
      <header className={`topbar ${menuOpen ? "is-open" : ""}`}>
        <div className="topbar__inner container">
          <div className="topbar__brand">
            <Link href="/" className="topbar__logo" aria-label="InspectHero home">
              <img src="/inspecthero-logo.png" alt="InspectHero logo" />
            </Link>
          </div>
        </div>
      </header>

      {/* Nav Strip */}
      <nav
        className={styles.navStrip}
        aria-label="Primary"
        data-navstrip
      >
        <div className={`${styles.navStripInner} container`}>
          <div className={styles.navStripLinks}>
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={`strip-${link.href}`}
                  href={link.href}
                  className={`${styles.navStripLink} ${isActive ? styles.navStripLinkActive : ""}`.trim()}
                >
                  {link.label}
                </Link>
              );
            })}
            {isAdmin && (
              <div
                className={styles.adminDropdownWrapper}
                ref={adminDropdownRef}
              >
                <button
                  className={`${styles.navStripLink} ${styles.adminDropdownToggle} ${adminLinks.some((l) => pathname === l.href) ? styles.navStripLinkActive : ""}`.trim()}
                  onClick={() => setAdminDropdownOpen((prev) => !prev)}
                >
                  Admin <span className={styles.dropdownCaret}>▾</span>
                </button>
                {adminDropdownOpen && (
                  <div className={styles.adminDropdownMenu}>
                    {adminLinks.map((link) => {
                      const isActive = pathname === link.href;
                      return (
                        <Link
                          key={`admin-${link.href}`}
                          href={link.href}
                          onClick={() => setAdminDropdownOpen(false)}
                          className={`${styles.adminDropdownItem} ${isActive ? styles.adminDropdownItemActive : ""}`.trim()}
                        >
                          {link.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.navStripControls}>
            <button
              className={styles.navUploadTask}
              onClick={() => window.dispatchEvent(new CustomEvent("open-new-task"))}
              style={{ cursor: "pointer" }}
            >
              + {t("home", "createNewTask", "Neue Aufgabe")}
            </button>
            <button
              className={styles.navUploadQuestion}
              onClick={() => window.dispatchEvent(new CustomEvent("open-new-question"))}
              style={{ cursor: "pointer", marginLeft: 8 }}
            >
              ? {t("home", "askQuestion", "Ask Question")}
            </button>
            <ThemeSwitcher />
            <LanguageSwitcher />
            <LogoutButton className={styles.navLogout} />
          </div>
        </div>
      </nav>

      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        InspectHero © {currentYear} — {footerTagline}
      </footer>
    </div>
  );
}
