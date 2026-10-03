// The session row ID is a display marker, never the authentication token.
export function readThemePreference(sessionId: number | null): string | null {
  try {
    const marker = sessionId === null ? "" : String(sessionId);
    if (!marker || window.sessionStorage.getItem("bpma-theme-session") !== marker) {
      window.sessionStorage.removeItem("bpma-theme");
      window.sessionStorage.setItem("bpma-theme-session", marker);
    }
    return window.sessionStorage.getItem("bpma-theme");
  } catch {
    return null;
  }
}

export function saveThemePreference(sessionId: number | null, theme: "light" | "dark") {
  readThemePreference(sessionId);
  try { window.sessionStorage.setItem("bpma-theme", theme); } catch {}
}

export const themeInitScript = (institutional: string, sessionId: number | null) => `
(() => {
  const readPreference = ${readThemePreference.toString()};
  const syncTheme = () => {
    try {
      const marker = document.documentElement.dataset.themeSession;
      const theme = readPreference(marker === undefined ? ${JSON.stringify(sessionId)} : marker ? Number(marker) : null);
      const institutional = document.documentElement.dataset.institutionalTheme || ${JSON.stringify(institutional)};
      const dark = theme === "dark" || (theme !== "light" && (institutional === "ESCURO" ||
        (institutional === "AUTOMATICO" && window.matchMedia('(prefers-color-scheme: dark)').matches)));
      document.documentElement.classList.toggle("dark", dark);
    } catch {}
  };
  syncTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
})();
`;
