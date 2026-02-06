"use client";
import React from "react";
import Link from "next/link";
import styles from "./UnifiedLayout.module.css";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Zadania" },
  { href: "/plans", label: "Plany" },
  { href: "/users", label: "Użytkownicy" },
  { href: "/companies", label: "Firmy" },
];

export default function UnifiedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={styles.layoutRoot}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span style={{ fontWeight: 900, fontSize: 28, marginRight: 8 }}>🛡️</span>
          InspectHero
        </div>
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
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        InspectHero © {new Date().getFullYear()} — Platforma do inspekcji i raportowania
      </footer>
    </div>
  );
}
