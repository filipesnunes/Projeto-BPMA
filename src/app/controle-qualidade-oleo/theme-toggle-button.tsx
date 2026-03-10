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
    const nextTheme =
      savedTheme === "dark" || savedTheme === "light" ? savedTheme : fallbackTheme;

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
    <button type="button" onClick={toggleTheme} className="btn-secondary">
      {theme === "dark" ? "Tema Claro" : "Tema Escuro"}
    </button>
  );
}