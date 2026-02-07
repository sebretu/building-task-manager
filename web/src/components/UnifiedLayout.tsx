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
      <header className="home-topbar">
        <nav className="home-nav">
          <Link href="/" className="home-nav-link">
            Aufgaben
          </Link>
          <Link href="/plans" className="home-nav-link">
            Pläne
          </Link>
          <Link href="/users" className="home-nav-link">
            Benutzer
          </Link>
          <Link href="/companies" className="home-nav-link">
            Unternehmen
          </Link>
        </nav>
        <div className="home-topbar-actions">
          {/* Jeśli chcesz, zamień na <LanguageSwitcher /> */}
            {/* LanguageSwitcher usunięty na życzenie */}
        </div>
      </header>
      <main className={styles.main}>{children}</main>

      <footer className={styles.footer}>
        InspectHero © {new Date().getFullYear()} — Platforma do inspekcji i raportowania
      </footer>
    </div>
  );
}
