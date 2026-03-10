const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MINUTE_IN_MS = 60 * 1000;

function createLocalDateOnly(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
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

export function getYearDateRange(ano: number): { start: Date; end: Date } {
  const start = toDatabaseDateOnly(createLocalDateOnly(ano, 0, 1));
  const end = toDatabaseDateOnly(createLocalDateOnly(ano, 11, 31));

  return { start, end };
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
  return toDatabaseDateOnly(new Date());
}

export function getCurrentSystemDateTime(): Date {
  return new Date();
}
