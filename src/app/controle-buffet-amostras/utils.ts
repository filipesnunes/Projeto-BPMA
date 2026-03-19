import type {
  ClassificacaoItemBuffetAmostra,
  StatusItemBuffetAmostra,
  StatusTemperaturaBuffetAmostra
} from "@prisma/client";

const MINUTE_IN_MS = 60 * 1000;

export type StatusServicoBuffet = "PENDENTE" | "PARCIAL" | "CONCLUIDO";

export type AvaliacaoTemperaturaBuffet = {
  status: StatusTemperaturaBuffetAmostra;
  orientacao: string;
  exigeAcaoCorretiva: boolean;
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

export function getYearDateRange(ano: number): { start: Date; end: Date } {
  const start = toDatabaseDateOnly(createLocalDateOnly(ano, 0, 1));
  const end = toDatabaseDateOnly(createLocalDateOnly(ano, 11, 31));

  return { start, end };
}

export function periodKey(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function getClassificacaoLabel(
  classificacao: ClassificacaoItemBuffetAmostra
): string {
  if (classificacao === "QUENTE") {
    return "Quente";
  }

  if (classificacao === "FRIO") {
    return "Frio";
  }

  return "Frio Cru";
}

export function getStatusItemLabel(status: StatusItemBuffetAmostra): string {
  if (status === "PREENCHIDO") {
    return "Preenchido";
  }

  if (status === "ASSINADO") {
    return "Assinado";
  }

  return "Pendente";
}

export function getStatusTemperaturaLabel(
  status: StatusTemperaturaBuffetAmostra
): string {
  if (status === "ALERTA") {
    return "Alerta";
  }

  if (status === "CRITICO") {
    return "Crítico";
  }

  return "Conforme";
}

export function getStatusServicoLabel(status: StatusServicoBuffet): string {
  if (status === "PARCIAL") {
    return "Parcial";
  }

  if (status === "CONCLUIDO") {
    return "Concluído";
  }

  return "Pendente";
}

export function avaliarTemperaturaBuffet(
  classificacao: ClassificacaoItemBuffetAmostra,
  temperaturaReferencia: number
): AvaliacaoTemperaturaBuffet {
  if (classificacao === "QUENTE") {
    if (temperaturaReferencia > 60) {
      return {
        status: "CONFORME",
        orientacao: "Acima de 60°C: exposição permitida por no máximo 6 horas.",
        exigeAcaoCorretiva: false
      };
    }

    return {
      status: "CRITICO",
      orientacao: "Abaixo de 60°C: exposição permitida por no máximo 1 hora.",
      exigeAcaoCorretiva: true
    };
  }

  if (classificacao === "FRIO") {
    if (temperaturaReferencia <= 10) {
      return {
        status: "CONFORME",
        orientacao: "Até 10°C: exposição permitida por no máximo 4 horas.",
        exigeAcaoCorretiva: false
      };
    }

    if (temperaturaReferencia <= 21) {
      return {
        status: "ALERTA",
        orientacao: "Entre 10°C e 21°C: exposição permitida por no máximo 2 horas.",
        exigeAcaoCorretiva: true
      };
    }

    return {
      status: "CRITICO",
      orientacao: "Acima de 21°C: fora do padrão para alimento frio.",
      exigeAcaoCorretiva: true
    };
  }

  if (temperaturaReferencia <= 5) {
    return {
      status: "CONFORME",
      orientacao: "Até 5°C: exposição permitida por no máximo 2 horas para alimento cru.",
      exigeAcaoCorretiva: false
    };
  }

  return {
    status: "CRITICO",
    orientacao: "Acima de 5°C: fora do padrão para preparações com carnes e pescados crus.",
    exigeAcaoCorretiva: true
  };
}

export function calcularStatusServico(params: {
  totalItens: number;
  itensAssinados: number;
  itensIniciados: number;
}): StatusServicoBuffet {
  if (params.totalItens <= 0 || params.itensIniciados <= 0) {
    return "PENDENTE";
  }

  if (params.itensAssinados >= params.totalItens) {
    return "CONCLUIDO";
  }

  return "PARCIAL";
}
