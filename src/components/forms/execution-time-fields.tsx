"use client";
import { useEffect, useRef, useState } from "react";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { UnreportedTimeFields } from "./unreported-time-fields";

export type ExecutionTimeValue = { horarioExecucao: string; horarioNaoInformado: boolean; justificativaHorario: string };

export function ExecutionTimeFields({ date, prefix = "", defaultTime = "", defaultUnknown = false, defaultJustification = "", required = true, value, onValueChange }: {
  date: string; prefix?: string; defaultTime?: string; defaultUnknown?: boolean; defaultJustification?: string; required?: boolean;
  value?: ExecutionTimeValue; onValueChange?: (value: ExecutionTimeValue) => void;
}) {
  const [localUnknown, setUnknown] = useState(defaultUnknown);
  const unknown = value?.horarioNaoInformado ?? localUnknown;
  const today = formatAppDateInput(getAppDate());
  if (date >= today) return <p className="text-xs text-slate-500">O horário de execução será registrado automaticamente.</p>;
  return <fieldset className="space-y-2 rounded-lg border p-3">
    <legend className="text-sm">Horário real da execução</legend>
    <UnreportedTimeFields unknown={unknown} onChange={next => {
      if (value && onValueChange) onValueChange({ ...value, horarioNaoInformado: next, horarioExecucao: next ? "" : value.horarioExecucao, justificativaHorario: next ? value.justificativaHorario : "" });
      else setUnknown(next);
    }} justification={value?.justificativaHorario ?? defaultJustification} prefix={prefix}
      onJustificationChange={value && onValueChange ? next => onValueChange({ ...value, justificativaHorario: next }) : undefined} />
    {!unknown && <label className="block text-sm">Horário da execução *<input type="time" name={prefix + "horarioExecucao"} required={required}
      {...(value ? { value: value.horarioExecucao, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onValueChange?.({ ...value, horarioExecucao: event.target.value }) } : { defaultValue: defaultTime })} className="bpma-input" /></label>}
  </fieldset>;
}

export function ReferenceExecutionFields({ defaultDate, today, skipWhen }: { defaultDate: string; today: string; skipWhen?: string }) {
  const [date, setDate] = useState(defaultDate);
  const [skipped, setSkipped] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = root.current?.closest("form");
    const update = () => { const input = skipWhen ? form?.elements.namedItem(skipWhen) : null; setSkipped(input instanceof HTMLInputElement && input.checked); };
    update(); form?.addEventListener("change", update);
    return () => form?.removeEventListener("change", update);
  }, [skipWhen]);
  return <div ref={root} className="space-y-3 md:col-span-2"><label className="block text-sm">Data do Procedimento *
    <input type="date" name="data" required value={date} max={today} onChange={e => setDate(e.target.value)} className="bpma-input" />
  </label>{!skipped && <ExecutionTimeFields key={date} date={date} />}</div>;
}
