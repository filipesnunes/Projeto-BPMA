"use client";

import { useState } from "react";
import { calculateProcessEnd } from "./utils";

export function ProcessTimeFields({ defaultInicio = "", defaultTermino, inputClassName }: {
  defaultInicio?: string;
  defaultTermino?: string;
  inputClassName: string;
}) {
  const [inicio, setInicio] = useState(defaultInicio);
  // Keep historical times intact until the start is explicitly changed.
  const termino = inicio === defaultInicio && defaultTermino !== undefined ? defaultTermino : calculateProcessEnd(inicio);
  return <>
    <label className="text-sm text-slate-700 dark:text-slate-200">
      Início do Processo *
      <input type="time" name="inicioProcesso" required value={inicio} className={inputClassName}
        onChange={(event) => setInicio(event.target.value)} />
    </label>
    <label className="text-sm text-slate-700 dark:text-slate-200">
      Término do Processo
      <input type="time" name="terminoProcesso" readOnly value={termino} className={inputClassName} />
      <span className="mt-1 block text-xs text-slate-500">Calculado automaticamente: início + 2 minutos.</span>
    </label>
  </>;
}
