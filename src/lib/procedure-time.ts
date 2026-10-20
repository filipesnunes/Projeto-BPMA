import { APP_TIME_ZONE, formatAppDateInput, getAppDate, getAppNow } from "@/lib/date-time";

export const UNKNOWN_PROCEDURE_TIME = "Horário não informado";
export const isValidProcedureTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const operationalTime = (date: Date): string => new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(date);

export function assertProcedureDate(date: Date, now = getAppNow()) {
  if (formatAppDateInput(date) > formatAppDateInput(getAppDate(now))) throw new Error("A data do procedimento não pode estar no futuro.");
}

export function assertProcedureTime(value: string, date: Date, now = getAppNow()) {
  assertProcedureDate(date, now);
  if (!isValidProcedureTime(value)) throw new Error("Informe um horário válido no formato HH:mm.");
  if (formatAppDateInput(date) === formatAppDateInput(getAppDate(now)) && value > operationalTime(now)) {
    throw new Error("O horário do procedimento não pode estar no futuro.");
  }
}

export function readUnreportedTime(form: FormData, retroactive: boolean) {
  const unknown = form.get("horarioNaoInformado") === "true";
  const raw = form.get("justificativaHorario");
  const justification = typeof raw === "string" ? raw.trim() : "";
  if (unknown && !retroactive) throw new Error("A opção de horário não informado é exclusiva de registros retroativos.");
  if (unknown && (!justification || justification.length > 1000)) throw new Error("Informe uma justificativa para o horário não informado, com até 1000 caracteres.");
  return { horarioNaoInformado: unknown, justificativaHorario: unknown ? justification : null };
}

export function temperatureMeasurementTime(record: {
  data: Date; createdAt?: Date | null; horarioAfericao?: string | null; horarioNaoInformado?: boolean;
}): string {
  if (record.horarioNaoInformado) return UNKNOWN_PROCEDURE_TIME;
  if (record.horarioAfericao && isValidProcedureTime(record.horarioAfericao)) return record.horarioAfericao;
  // Legacy rows never acquire a presumed time from a later insertion date.
  return record.createdAt && Number.isFinite(record.createdAt.getTime()) &&
    formatAppDateInput(getAppDate(record.createdAt)) === formatAppDateInput(record.data)
    ? operationalTime(record.createdAt) : "-";
}

export function procedureObservation(observation: string | null | undefined, record: {
  horarioNaoInformado?: boolean; justificativaHorario?: string | null;
}): string {
  return [observation?.trim(), record.horarioNaoInformado && record.justificativaHorario
    ? `${UNKNOWN_PROCEDURE_TIME}: ${record.justificativaHorario}` : ""].filter(Boolean).join("\n");
}
