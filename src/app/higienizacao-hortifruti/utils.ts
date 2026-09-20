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

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function calculateProcessEnd(start: string): string {
  const minutes = parseTimeToMinutes(start);
  if (minutes === null) return "";
  const end = (minutes + 2) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function parseDateInput(value: string): Date | null {
  return parseAppDateInput(value);
}

export function parseTimeToMinutes(value: string): number | null {
  const match = TIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours * 60 + minutes;
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

export function getDurationInMinutes(
  inicioProcesso: string,
  terminoProcesso: string
): number | null {
  const inicioMinutos = parseTimeToMinutes(inicioProcesso);
  const terminoMinutos = parseTimeToMinutes(terminoProcesso);

  if (inicioMinutos === null || terminoMinutos === null) {
    return null;
  }

  return terminoMinutos - inicioMinutos;
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

export function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function getTodaySystemDate(): Date {
  return getAppDate();
}

export function getCurrentSystemDateTime(): Date {
  return getAppNow();
}
