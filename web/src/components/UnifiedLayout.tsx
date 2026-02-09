"use client";
import React, { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./UnifiedLayout.module.css";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/contexts/LanguageContext";
import { LogoutButton } from "@/components/LogoutButton";

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = pathname?.startsWith("/task/");
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const footerTagline = t("footer", "tagline", "Inspection and reporting platform");

  const navLinks = useMemo(
    () => [
      { href: "/", label: t("nav", "tasks", "Aufgaben") },
      { href: "/plans", label: t("nav", "plans", "Pläne") },
      { href: "/users", label: t("nav", "users", "Benutzer") },
      { href: "/companies", label: t("nav", "companies", "Unternehmen") },
    ],
    [t]
  );

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

          <button
            className="topbar__toggle"
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className="topbar__nav" aria-label="Primary">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`topbar__link ${isActive ? "is-active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <nav className={styles.navStrip} aria-label="Primary">
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
          </div>
          <div className={styles.navStripControls}>
            <Link href="/plans/upload" className={styles.navUpload}>
              Upload plan
            </Link>
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
