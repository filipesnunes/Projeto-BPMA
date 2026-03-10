"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "bpma-theme";

type ThemeMode = "light" | "dark";

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggleButton() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const fallbackTheme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    const nextTheme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : fallbackTheme;

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
    >
      {theme === "dark" ? "Tema Claro" : "Tema Escuro"}
    </button>
  );
}
