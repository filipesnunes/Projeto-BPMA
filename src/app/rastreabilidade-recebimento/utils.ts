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

export type Conformidade = "CONFORME" | "NAO_CONFORME";
export type StatusRecebimento = "PENDENTE" | "CONFORME" | "NAO_CONFORME";

export function parseDateInput(value: string | null | undefined): Date | null {
  return parseAppDateInput(normalizeDateInputString(value));
}

export function isValidDateValue(value: Date | null | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function parseXmlDateToDatabase(value: string | null | undefined): Date | null {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const ymdMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    return parseDateInput(`${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`);
  }

  const compactMatch = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return parseDateInput(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`);
  }

  const brMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return parseDateInput(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`);
  }

  return null;
}

export function parsePositiveInt(value: string | null | undefined): number | null {
  const parsed = Number(String(value ?? ""));

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function normalizeDateInputString(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const brDateMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brDateMatch) {
    return `${brDateMatch[3]}-${brDateMatch[2]}-${brDateMatch[1]}`;
  }

  return trimmed;
}

export function normalizeTemperatureInputString(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(",", ".");
}

export function parseTemperatureInput(value: string | null | undefined): number | null {
  const normalized = normalizeTemperatureInputString(value);

  if (!normalized) {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function formatDateInput(date: Date | null | undefined): string {
  if (!isValidDateValue(date)) {
    return "";
  }

  return formatAppDateInput(date);
}

export function formatDateDisplay(date: Date | null | undefined): string {
  if (!isValidDateValue(date)) {
    return "Data inválida";
  }

  return formatAppDate(date);
}

export function formatOptionalDateDisplay(date: Date | null): string {
  return date ? formatDateDisplay(date) : "-";
}

export function formatManufacturingDateDisplay(
  date: Date | null | undefined,
  semDataFabricacao = false
): string {
  if (semDataFabricacao) return "Sem data de fabricação";
  return date ? formatDateDisplay(date) : "-";
}

export function formatDateTimeDisplay(date: Date | null | undefined): string {
  if (!isValidDateValue(date)) {
    return "Data inválida";
  }

  return formatAppDateTime(date);
}

export function formatTemperatureDisplay(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
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

export function parseConformidade(value: string): Conformidade | null {
  if (value === "CONFORME") {
    return "CONFORME";
  }

  if (value === "NAO_CONFORME") {
    return "NAO_CONFORME";
  }

  return null;
}

export function getConformidadeLabel(value: Conformidade | null): string {
  if (value === "CONFORME") {
    return "Conforme";
  }

  if (value === "NAO_CONFORME") {
    return "Não Conforme";
  }

  return "-";
}

export function getStatusRecebimentoLabel(status: StatusRecebimento): string {
  if (status === "CONFORME") {
    return "Conforme";
  }

  if (status === "NAO_CONFORME") {
    return "Não Conforme";
  }

  return "Pendente";
}

export function calculateTemperatureStatus(
  temperatura: number | null | undefined,
  temperaturaMaxima: number | null | undefined
): Conformidade {
  if (
    typeof temperatura !== "number" ||
    typeof temperaturaMaxima !== "number" ||
    !Number.isFinite(temperatura) ||
    !Number.isFinite(temperaturaMaxima)
  ) {
    return "CONFORME";
  }

  return temperatura > temperaturaMaxima ? "NAO_CONFORME" : "CONFORME";
}

export function isActionCorrectiveRequired(params: {
  temperaturaStatus: Conformidade | null;
  transporteEntregador: Conformidade | null;
  aspectoSensorial: Conformidade | null;
  embalagem: Conformidade | null;
}): boolean {
  return (
    params.temperaturaStatus === "NAO_CONFORME" ||
    params.transporteEntregador === "NAO_CONFORME" ||
    params.aspectoSensorial === "NAO_CONFORME" ||
    params.embalagem === "NAO_CONFORME"
  );
}

export function calculateOverallStatus(params: {
  temperaturaStatus: Conformidade | null;
  transporteEntregador: Conformidade | null;
  aspectoSensorial: Conformidade | null;
  embalagem: Conformidade | null;
}): StatusRecebimento {
  const hasNullField =
    params.temperaturaStatus === null ||
    params.transporteEntregador === null ||
    params.aspectoSensorial === null ||
    params.embalagem === null;

  if (hasNullField) {
    return "PENDENTE";
  }

  return isActionCorrectiveRequired(params) ? "NAO_CONFORME" : "CONFORME";
}
