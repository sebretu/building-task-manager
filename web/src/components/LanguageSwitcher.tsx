"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <label style={{ fontSize: "12px", color: "#666", fontWeight: "500" }}>
        🌐
      </label>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as "en" | "pl" | "de")}
        style={{
          padding: "6px 10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          background: "white",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "500",
        }}
      >
        <option value="en">English</option>
        <option value="pl">Polski</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
  );
}
