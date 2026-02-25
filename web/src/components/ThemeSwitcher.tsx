"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const THEMES = [
  { value: "dark-blue", label: "Dark Blue", icon: "🌌" },
  { value: "dark-green", label: "Dark Green", icon: "🌲" },
  { value: "dark-purple", label: "Dark Purple", icon: "🔮" },
  { value: "ocean", label: "Ocean", icon: "🌊" },
  { value: "light", label: "Light", icon: "☀️" },
  { value: "midnight", label: "Midnight Black", icon: "🌑" },
  { value: "red-alert", label: "Red Alert", icon: "��" },
  { value: "amber", label: "Amber Terminal", icon: "📟" },
];

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setIsDark(true);
      document.body.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.body.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className="w-8 h-8 opacity-0"></div>;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleTheme}
        title={isDark ? "Tryb jasny" : "Tryb ciemny"}
        aria-label="Przełącz motyw"
        className="flex items-center justify-center w-[30px] h-[30px] rounded-full border border-[var(--home-line)] bg-[var(--home-soft)] hover:bg-[var(--ui-bg)] transition-colors shadow-sm text-sm"
      >
        {isDark ? "☀️" : "🌙"}
      </button>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--home-line)] bg-[var(--home-soft)] shadow-sm">
        <span className="text-sm" aria-hidden="true">🎨</span>
        <select
          className="bg-transparent text-xs font-bold outline-none cursor-pointer appearance-none pr-1"
          style={{ color: "inherit" }}
          value={theme || "dark-blue"}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Color theme"
          suppressHydrationWarning
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.icon} {t.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--ui-muted,#8b97aa)]" aria-hidden="true">▾</span>
      </div>
    </div>
  );
}
