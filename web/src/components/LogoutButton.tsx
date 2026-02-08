"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";

interface LogoutButtonProps {
  className?: string;
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
      router.refresh();
    } catch (error) {
      console.error("[LogoutButton] Failed to sign out", error);
    } finally {
      setPending(false);
    }
  }

  const label = pending ? t("common", "loading", "Loading...") : t("common", "logout", "Logout");

  return (
    <button
      type="button"
      className={className || ""}
      onClick={handleLogout}
      disabled={pending}
      aria-busy={pending}
    >
      {label}
    </button>
  );
}
