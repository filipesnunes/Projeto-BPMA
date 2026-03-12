import { StatusPlanoLimpeza, TurnoPlanoLimpeza } from "@prisma/client";

const MINUTE_IN_MS = 60 * 1000;
const WEEKLY_DAY_VALUES = [
  "SEGUNDA",
  "TERCA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SABADO",
  "DOMINGO"
] as const;

export type WeeklyDayValue = (typeof WEEKLY_DAY_VALUES)[number];

const WEEKLY_DAY_LABELS: Record<WeeklyDayValue, string> = {
  SEGUNDA: "Segunda-feira",
  TERCA: "Terça-feira",
  QUARTA: "Quarta-feira",
  QUINTA: "Quinta-feira",
  SEXTA: "Sexta-feira",
  SABADO: "Sábado",
  DOMINGO: "Domingo"
};

const WEEKLY_DAY_TOKENS: Record<string, WeeklyDayValue> = {
  seg: "SEGUNDA",
  segunda: "SEGUNDA",
  segundafeira: "SEGUNDA",
  ter: "TERCA",
  terca: "TERCA",
  tercafeira: "TERCA",
  qua: "QUARTA",
  quarta: "QUARTA",
  quartafeira: "QUARTA",
  qui: "QUINTA",
  quinta: "QUINTA",
  quintafeira: "QUINTA",
  sex: "SEXTA",
  sexta: "SEXTA",
  sextafeira: "SEXTA",
  sab: "SABADO",
  sabado: "SABADO",
  dom: "DOMINGO",
  domingo: "DOMINGO"
};

function normalizeWeekdayInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createLocalDateOnly(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

function getWeekRangeFromLocalDate(localDate: Date): { startLocal: Date; endLocal: Date } {
  const dayOfWeek = localDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const startLocal = new Date(localDate);
  startLocal.setDate(localDate.getDate() + diffToMonday);

  const endLocal = new Date(startLocal);
  endLocal.setDate(startLocal.getDate() + 6);

  return { startLocal, endLocal };
}

function toDatabaseDateOnly(date: Date): Date {
  const localDateOnly = createLocalDateOnly(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  return new Date(
    localDateOnly.getTime() - localDateOnly.getTimezoneOffset() * MINUTE_IN_MS
  );
}

function fromDatabaseDateOnly(date: Date): Date {
  return new Date(date.getTime() + date.getTimezoneOffset() * MINUTE_IN_MS);
}

export function parseDateInput(value: string): Date | null {
  const [year, month, day] = value.split("-").map((item) => Number(item));

  if (!year || !month || !day) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsedDate = createLocalDateOnly(year, month - 1, day);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return toDatabaseDateOnly(parsedDate);
}

export function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function formatDateInput(date: Date): string {
  const localDate = fromDatabaseDateOnly(date);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(date: Date): string {
  const localDate = fromDatabaseDateOnly(date);
  const day = String(localDate.getDate()).padStart(2, "0");
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const year = localDate.getFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateTimeDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function getTodaySystemDate(): Date {
  return toDatabaseDateOnly(new Date());
}

export function getCurrentSystemDateTime(): Date {
  return new Date();
}

export function getMonthYear(date: Date): { mes: number; ano: number } {
  const localDate = fromDatabaseDateOnly(date);

  return {
    mes: localDate.getMonth() + 1,
    ano: localDate.getFullYear()
  };
}

export function getMonthDateRange(mes: number, ano: number): {
  start: Date;
  end: Date;
} {
  const start = toDatabaseDateOnly(createLocalDateOnly(ano, mes - 1, 1));
  const end = toDatabaseDateOnly(createLocalDateOnly(ano, mes, 0));

  return { start, end };
}

export function getCurrentWeekDateRange(referenceDate: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const localDate = createLocalDateOnly(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const { startLocal, endLocal } = getWeekRangeFromLocalDate(localDate);

  return {
    start: toDatabaseDateOnly(startLocal),
    end: toDatabaseDateOnly(endLocal)
  };
}

export function getWeekDateRangeForDate(date: Date): {
  start: Date;
  end: Date;
} {
  const localDate = fromDatabaseDateOnly(date);
  const normalizedLocalDate = createLocalDateOnly(
    localDate.getFullYear(),
    localDate.getMonth(),
    localDate.getDate()
  );
  const { startLocal, endLocal } = getWeekRangeFromLocalDate(normalizedLocalDate);

  return {
    start: toDatabaseDateOnly(startLocal),
    end: toDatabaseDateOnly(endLocal)
  };
}

export function getWeekStartDateForDate(date: Date): Date {
  return getWeekDateRangeForDate(date).start;
}

export function getYearDateRange(ano: number): { start: Date; end: Date } {
  const start = toDatabaseDateOnly(createLocalDateOnly(ano, 0, 1));
  const end = toDatabaseDateOnly(createLocalDateOnly(ano, 11, 31));

  return { start, end };
}

export function periodKey(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

function isWeeklyDayValue(value: string): value is WeeklyDayValue {
  return WEEKLY_DAY_VALUES.includes(value as WeeklyDayValue);
}

export function getWeeklyDayValuesFromInput(value: string): WeeklyDayValue[] {
  const normalized = normalizeWeekdayInput(value);
  if (!normalized) {
    return [];
  }

  const values = new Set<WeeklyDayValue>();
  const directToken = normalized.replace(/[^a-z]/g, "");
  const directValue = WEEKLY_DAY_TOKENS[directToken];
  if (directValue) {
    values.add(directValue);
  }

  const tokens = normalized.split(/[^a-z]+/).filter(Boolean);
  for (const token of tokens) {
    const dayValue = WEEKLY_DAY_TOKENS[token];
    if (dayValue) {
      values.add(dayValue);
    }
  }

  if (isWeeklyDayValue(value.trim().toUpperCase())) {
    values.add(value.trim().toUpperCase() as WeeklyDayValue);
  }

  return WEEKLY_DAY_VALUES.filter((dayValue) => values.has(dayValue));
}

export function parseWeeklyDay(value: string): WeeklyDayValue | null {
  const values = getWeeklyDayValuesFromInput(value);
  return values[0] ?? null;
}

export function getWeeklyDayLabel(value: string): string {
  const parsed = parseWeeklyDay(value);
  if (!parsed) {
    return value;
  }

  return WEEKLY_DAY_LABELS[parsed];
}

export function getWeeklyDayValueFromDate(date: Date): WeeklyDayValue {
  const localDate = fromDatabaseDateOnly(date);
  const day = localDate.getDay();

  if (day === 1) return "SEGUNDA";
  if (day === 2) return "TERCA";
  if (day === 3) return "QUARTA";
  if (day === 4) return "QUINTA";
  if (day === 5) return "SEXTA";
  if (day === 6) return "SABADO";
  return "DOMINGO";
}

export function getStatusLabel(status: StatusPlanoLimpeza): string {
  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return "Aguardando Supervisor";
  }

  return status === StatusPlanoLimpeza.CONCLUIDO ? "Concluído" : "Pendente";
}

export function getTurnoLabel(turno: TurnoPlanoLimpeza): string {
  if (turno === TurnoPlanoLimpeza.MANHA) return "Manhã";
  if (turno === TurnoPlanoLimpeza.TARDE) return "Tarde";
  return "Noite";
}

export function parseDailyStatus(value: string): StatusPlanoLimpeza | null {
  if (value === StatusPlanoLimpeza.PENDENTE) return StatusPlanoLimpeza.PENDENTE;
  if (value === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR;
  }
  if (value === StatusPlanoLimpeza.CONCLUIDO) return StatusPlanoLimpeza.CONCLUIDO;
  return null;
}

export function parseWeeklyStatus(value: string): StatusPlanoLimpeza | null {
  if (value === StatusPlanoLimpeza.PENDENTE) return StatusPlanoLimpeza.PENDENTE;
  if (value === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR;
  }
  if (value === StatusPlanoLimpeza.CONCLUIDO) return StatusPlanoLimpeza.CONCLUIDO;
  return null;
}

export function parseTurno(value: string): TurnoPlanoLimpeza | null {
  if (value === TurnoPlanoLimpeza.MANHA) return TurnoPlanoLimpeza.MANHA;
  if (value === TurnoPlanoLimpeza.TARDE) return TurnoPlanoLimpeza.TARDE;
  if (value === TurnoPlanoLimpeza.NOITE) return TurnoPlanoLimpeza.NOITE;
  return null;
}
