"use client";
import React, { useState } from "react";
import Link from "next/link";
import styles from "./UnifiedLayout.module.css";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const navLinks = [
  { href: "/", label: "Aufgaben" },
  { href: "/plans", label: "Pläne" },
  { href: "/users", label: "Benutzer" },
  { href: "/companies", label: "Unternehmen" },
];

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.layoutRoot}>
      <header className={`topbar ${menuOpen ? "is-open" : ""}`}>
        <div className="topbar__inner container">
          <div className="topbar__brand">
            <Link href="/" className="topbar__logo" aria-label="InspectHero home">
              <img src="/logo-uploaded.png" alt="Logo" />
              <span>InspectHero</span>
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

          <div className="topbar__actions">
            <div className="lang-switch">
              <LanguageSwitcher />
            </div>
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
