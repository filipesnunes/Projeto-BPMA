"use client";

import { useState, type ReactNode } from "react";
import { calculateProcessEnd, formatDateInput, getTodaySystemDate } from "./utils";
import { UnreportedTimeFields } from "@/components/forms/unreported-time-fields";

export function ProcessTimeFields({ defaultInicio = "", defaultTermino, inputClassName,
  defaultDate, todayDate, editableDate = false, defaultUnknown = false, defaultJustification, children }: {
  defaultInicio?: string | null; defaultTermino?: string | null; inputClassName: string;
  defaultDate?: string; todayDate?: string; editableDate?: boolean; defaultUnknown?: boolean;
  defaultJustification?: string | null; children?: ReactNode;
}) {
  const today = todayDate ?? formatDateInput(getTodaySystemDate());
  const initialDate = defaultDate ?? today;
  const [date, setDate] = useState(initialDate);
  const [inicio, setInicio] = useState(defaultInicio ?? "");
  const [manualEnd, setManualEnd] = useState(defaultTermino ?? "");
  const [unknown, setUnknown] = useState(defaultUnknown);
  const retroactive = date !== "" && date < today;
  // Keep historical times intact until the start is explicitly changed.
  const termino = retroactive ? manualEnd :
    inicio === defaultInicio && date === initialDate && defaultTermino != null ? defaultTermino : calculateProcessEnd(inicio);
  return <>
    {editableDate ? <label className="text-sm text-slate-700 md:col-span-2 dark:text-slate-200">
      Data do Procedimento *
      <input type="date" name="data" required max={today} value={date} className={inputClassName}
        onChange={event => {setDate(event.currentTarget.value);setInicio("");setManualEnd("");setUnknown(false);}} />
    </label> : null}
    {children}
    {retroactive ? <UnreportedTimeFields key={date} unknown={unknown}
      onChange={value=>{setUnknown(value);setInicio("");setManualEnd("");}} justification={defaultJustification} /> : null}
    {!(retroactive && unknown) ? <>
    <label className="text-sm text-slate-700 dark:text-slate-200">
      Início do Processo *
      <input type="time" name="inicioProcesso" required value={inicio} className={inputClassName}
        onChange={(event) => setInicio(event.target.value)} />
    </label>
    <label className="text-sm text-slate-700 dark:text-slate-200">
      Término do Processo
      <input type="time" name="terminoProcesso" readOnly={!retroactive} required={retroactive} min={retroactive && inicio ? inicio : undefined}
        value={termino} className={inputClassName} onChange={event=>setManualEnd(event.currentTarget.value)} />
      {!retroactive ? <span className="mt-1 block text-xs text-slate-500">Calculado automaticamente: início + 2 minutos.</span> : null}
    </label>
    </> : null}
  </>;
}
