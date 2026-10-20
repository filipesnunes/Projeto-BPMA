"use client";
import { useState } from "react";
import { formatAppDateInput, getAppDate } from "@/lib/date-time";
import { ExecutionTimeFields } from "./execution-time-fields";

export function WeeklyExecutionFields({ weekStart, defaultDate }: { weekStart: string; defaultDate?: string }) {
  const end = new Date(weekStart + "T00:00:00.000Z"); end.setUTCDate(end.getUTCDate() + 6);
  const today = formatAppDateInput(getAppDate());
  const max = formatAppDateInput(end) < today ? formatAppDateInput(end) : today;
  const [date, setDate] = useState(defaultDate && defaultDate >= weekStart && defaultDate <= max ? defaultDate : today >= weekStart && today <= max ? today : weekStart);
  return <div className="space-y-2"><label className="block text-sm">Data real da execução *<input type="date" name="dataExecucao" required min={weekStart} max={max} value={date} onChange={e => setDate(e.target.value)} className="bpma-input" /></label><ExecutionTimeFields key={date} date={date} /></div>;
}
