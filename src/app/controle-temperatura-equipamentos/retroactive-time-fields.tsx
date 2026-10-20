"use client";
import { useState } from "react";
import { UnreportedTimeFields } from "@/components/forms/unreported-time-fields";

export function RetroactiveTemperatureTimeFields() {
  const [unknown, setUnknown] = useState(false);
  return <>
    <UnreportedTimeFields unknown={unknown} onChange={setUnknown} />
    {!unknown ? <label className="text-sm text-slate-700 dark:text-slate-200">Horário da aferição *
      <input type="time" name="horarioAfericao" required className="bpma-input" />
    </label> : null}
  </>;
}
