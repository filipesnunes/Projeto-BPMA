import { formatAppDateInput, parseAppDateInput } from "@/lib/date-time";

export const temperatureHistoryPath = "/controle-temperatura-equipamentos/historico";
const historyKeys = ["filtroData", "filtroMes", "filtroAno", "filtroEquipamento", "filtroStatus", "filtroResponsavel", "pagina", "detalhePagina", "fluxoPagina", "dia"] as const;

// Accept only this module's History, never an arbitrary return URL.
export function temperatureHistoryReturnTo(value: unknown, date?: Date): string | null {
  if (typeof value !== "string" || value.length > 8000 || !value.startsWith("/") || /[\\\r\n\t]/.test(value)) return null;
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost" || url.pathname !== temperatureHistoryPath) return null;
    const query = new URLSearchParams();
    for (const key of historyKeys) {
      const entry = url.searchParams.get(key);
      if (entry) query.set(key, entry);
    }
    if (date) query.set("dia", formatAppDateInput(date));
    for (const key of ["dia", "filtroData"]) {
      if (query.has(key) && !parseAppDateInput(query.get(key)!)) return null;
    }
    return temperatureHistoryPath + (query.size ? `?${query}` : "");
  } catch { return null; }
}

export function withTemperatureHistory(path: string, returnTo: string | null): string {
  if (!returnTo) return path;
  const url = new URL(path, "http://localhost");
  url.searchParams.set("returnTo", returnTo);
  return url.pathname + url.search;
}
