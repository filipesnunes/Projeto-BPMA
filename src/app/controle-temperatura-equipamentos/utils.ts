const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE_IN_MS = 60 * 1000;

export type CategoriaTemperatura = "REFRIGERACAO" | "CONGELAMENTO" | "QUENTE";
export type TurnoTemperatura = "MANHA" | "TARDE";
export type StatusTemperatura = "CONFORME" | "ALERTA" | "CRITICO";
export type CategoriaParametrosTemperatura = {
  temperaturaIdealMin: number | null;
  temperaturaIdealMax: number | null;
  temperaturaAlertaMin: number | null;
  temperaturaAlertaMax: number | null;
  temperaturaCriticaMin: number | null;
  temperaturaCriticaMax: number | null;
};
export type CategoriaAcoesTemperatura = {
  acaoIdeal: string;
  acaoAlerta: string;
  acaoCritica: string;
  orientacaoCorretivaPadrao: string;
};
export type RegraTemperaturaCategoria = {
  temperaturaMin: number | null;
  temperaturaMax: number | null;
  status: StatusTemperatura;
  acaoCorretiva: string;
  ordem: number;
  isActive?: boolean;
};

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

export function parseNullableTemperatureInput(
  value: string
): number | null | "invalid" {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = parseTemperatureInput(trimmed);
  if (parsed === null) {
    return "invalid";
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
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function formatTemperatureDisplay(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  })} °C`;
}

function formatTemperatureValue(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  });
}

export function formatTemperatureRange(
  min: number | null,
  max: number | null
): string {
  if (min !== null && max !== null) {
    if (min === max) {
      return `${formatTemperatureValue(min)} °C`;
    }

    return `De ${formatTemperatureValue(min)} °C até ${formatTemperatureValue(max)} °C`;
  }

  if (min === null && max !== null) {
    return `Até ${formatTemperatureValue(max)} °C`;
  }

  if (min !== null && max === null) {
    return `Acima de ${formatTemperatureValue(min)} °C`;
  }

  return "Não configurada";
}

export function getTodaySystemDate(): Date {
  return toDatabaseDateOnly(new Date());
}

export function getCurrentSystemDateTime(): Date {
  return new Date();
}

export function getCurrentShift(date = new Date()): TurnoTemperatura {
  return date.getHours() < 12 ? "MANHA" : "TARDE";
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

function isInRange(value: number, min: number | null, max: number | null): boolean {
  if (min === null && max === null) {
    return false;
  }

  if (min !== null && value < min) {
    return false;
  }

  if (max !== null && value > max) {
    return false;
  }

  return true;
}

export function findMatchingTemperatureRule<T extends RegraTemperaturaCategoria>(
  temperatura: number,
  regras: T[]
): T | null {
  const regrasOrdenadas = [...regras].sort((a, b) => a.ordem - b.ordem);

  for (const regra of regrasOrdenadas) {
    if (regra.isActive === false) {
      continue;
    }

    if (isInRange(temperatura, regra.temperaturaMin, regra.temperaturaMax)) {
      return regra;
    }
  }

  return null;
}

export function classifyTemperatureByParameters(
  temperatura: number,
  parametros: CategoriaParametrosTemperatura
): StatusTemperatura {
  if (
    isInRange(
      temperatura,
      parametros.temperaturaIdealMin,
      parametros.temperaturaIdealMax
    )
  ) {
    return "CONFORME";
  }

  if (
    isInRange(
      temperatura,
      parametros.temperaturaAlertaMin,
      parametros.temperaturaAlertaMax
    )
  ) {
    return "ALERTA";
  }

  if (
    isInRange(
      temperatura,
      parametros.temperaturaCriticaMin,
      parametros.temperaturaCriticaMax
    )
  ) {
    return "CRITICO";
  }

  return parametros.temperaturaCriticaMin !== null ||
    parametros.temperaturaCriticaMax !== null
    ? "CRITICO"
    : "ALERTA";
}

export function isCorrectiveActionRequired(status: StatusTemperatura): boolean {
  return status === "ALERTA" || status === "CRITICO";
}

export function getAutomaticCorrectiveAction(
  status: StatusTemperatura,
  acoes: CategoriaAcoesTemperatura
): string {
  const acaoIdeal = acoes.acaoIdeal.trim();
  const acaoAlerta = acoes.acaoAlerta.trim();
  const acaoCritica = acoes.acaoCritica.trim();
  const orientacaoPadrao = acoes.orientacaoCorretivaPadrao.trim();

  if (status === "CONFORME") {
    return acaoIdeal || orientacaoPadrao;
  }

  if (status === "ALERTA") {
    return acaoAlerta || orientacaoPadrao;
  }

  return acaoCritica || orientacaoPadrao;
}

export function getStatusLabel(status: StatusTemperatura): string {
  if (status === "CONFORME") {
    return "Normal";
  }

  if (status === "ALERTA") {
    return "Alerta";
  }

  return "Crítico";
}

export function getShiftLabel(turno: TurnoTemperatura): string {
  return turno === "MANHA" ? "Manhã" : "Tarde";
}

export function getCategoriaLabel(categoria: CategoriaTemperatura): string {
  if (categoria === "REFRIGERACAO") {
    return "Refrigeração";
  }

  if (categoria === "CONGELAMENTO") {
    return "Congelamento";
  }

  return "Quente";
}
