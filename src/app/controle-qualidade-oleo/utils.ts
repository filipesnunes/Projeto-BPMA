import {
  formatAppDate,
  formatAppDateInput,
  formatAppDateTime,
  getAppDate,
  getAppMonthDateRange,
  getAppMonthYear,
  getAppNow,
  getAppYearDateRange,
  parseAppDateInput
} from "@/lib/date-time";

export const MIN_OIL_STRIP_TEMPERATURE_CELSIUS = 120;
export const OIL_STRIP_TEMPERATURE_FIELD_MESSAGE =
  "Temperatura mínima para leitura da fita: 120°C.";
export const OIL_STRIP_TEMPERATURE_SAVE_MESSAGE =
  "Não foi possível salvar. A temperatura informada está abaixo de 120°C, valor mínimo para leitura da fita.";

export type StatusOleo =
  | "ADEQUADO"
  | "ATENCAO"
  | "ULTIMA_UTILIZACAO"
  | "DESCARTAR"
  | "SEM_UTILIZACAO";

export function parseDateInput(value: string): Date | null {
  return parseAppDateInput(value);
}

export function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function parseTemperatureInput(value: string): number | null {
  const normalized = value.replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function formatDateInput(date: Date): string {
  return formatAppDateInput(date);
}

export function formatDateDisplay(date: Date): string {
  return formatAppDate(date);
}

export function formatDateTimeDisplay(date: Date): string {
  return formatAppDateTime(date);
}

export function formatTemperatureDisplay(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  })} °C`;
}

export function getTodaySystemDate(): Date {
  return getAppDate();
}

export function getNextOilStripDate(lastMeasurement: Date): Date {
  const next = new Date(lastMeasurement);
  next.setUTCDate(next.getUTCDate() + 3);
  return next;
}

export function getCurrentSystemDateTime(): Date {
  return getAppNow();
}

export function getMonthYear(date: Date): { mes: number; ano: number } {
  return getAppMonthYear(date);
}

export function getMonthDateRange(mes: number, ano: number): {
  start: Date;
  end: Date;
} {
  return getAppMonthDateRange(mes, ano);
}

export function getYearDateRange(ano: number): { start: Date; end: Date } {
  return getAppYearDateRange(ano);
}

export function periodKey(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function getStatusLabel(status: StatusOleo | null): string {
  if (status === null) return "Sem aferição da fita";
  if (status === "ADEQUADO") {
    return "Adequado";
  }

  if (status === "ATENCAO") {
    return "Atenção";
  }

  if (status === "ULTIMA_UTILIZACAO") {
    return "Última Utilização";
  }

  if (status === "SEM_UTILIZACAO") {
    return "Sem Utilização";
  }

  return "Descartar";
}

export function isTemperatureCritical(temperatura: number): boolean {
  return temperatura > 180;
}

export function isTemperatureBelowOilStripMinimum(temperatura: number): boolean {
  return temperatura < MIN_OIL_STRIP_TEMPERATURE_CELSIUS;
}
