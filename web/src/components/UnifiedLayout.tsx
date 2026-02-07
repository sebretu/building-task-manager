"use client";
import React from "react";
import Link from "next/link";
import styles from "./UnifiedLayout.module.css";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Aufgaben" },
  { href: "/plans", label: "Pläne" },
  { href: "/users", label: "Benutzer" },
  { href: "/companies", label: "Unternehmen" },
];

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={styles.layoutRoot}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <nav className={styles.nav}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname === link.href
                    ? `${styles.navLink} ${styles.navLinkActive}`
                    : styles.navLink
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div style={{ marginLeft: 16 }}>
            {/* LanguageSwitcher moved here */}
            <span style={{ display: 'inline-block', verticalAlign: 'middle', fontWeight: 700, fontSize: 18 }}>
              🌐▾
            </span>
            {/* Możesz zamienić na <LanguageSwitcher /> jeśli chcesz pełny komponent */}
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        InspectHero © {new Date().getFullYear()} — Platforma do inspekcji i raportowania
      </footer>
    </div>
  );
}
