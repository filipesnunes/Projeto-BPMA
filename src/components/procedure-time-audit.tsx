import { formatAppDateInput, formatAppDateTime, getAppDate } from "@/lib/date-time";
import { temperatureMeasurementTime } from "@/lib/procedure-time";

export function ProcedureTimeAudit({ record, temperature = false }: { record: {
  data: Date; createdAt?: Date | null; horarioAfericao?: string | null;
  horarioNaoInformado?: boolean; justificativaHorario?: string | null;
}; temperature?: boolean }) {
  const retroactive = record.createdAt && formatAppDateInput(record.data) < formatAppDateInput(getAppDate(record.createdAt));
  return <div className="mt-1 space-y-1 text-xs">
    {temperature ? <p>Aferição: {temperatureMeasurementTime(record)}</p> : null}
    {retroactive ? <p>Lançamento retroativo</p> : null}
    {record.createdAt ? <p>Lançado em: {formatAppDateTime(record.createdAt)}</p> : null}
    {record.horarioNaoInformado ? <p>Horário não informado. Justificativa: {record.justificativaHorario}</p> : null}
  </div>;
}
