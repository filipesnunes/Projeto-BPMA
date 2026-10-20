"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function TemperatureReferenceFields({ referenceDate, todayDate, editable, children }: {
  referenceDate: string; todayDate?: string; editable: boolean; children: ReactNode;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(referenceDate);
  const [pending, startTransition] = useTransition();

  return <fieldset disabled={pending} className="contents">
    {editable ? <label className="text-sm text-slate-700 dark:text-slate-200">
      Data do Procedimento *
      <input type="date" name="data" required value={selectedDate} max={todayDate} className="bpma-input"
        onChange={event => {
          const value = event.currentTarget.value;
          setSelectedDate(value);
          if (!value) return;
          const shift = event.currentTarget.form?.elements.namedItem("turno");
          const url = new URL(window.location.href);
          url.searchParams.set("new", "1");
          url.searchParams.set("dataRegistro", value);
          if (shift instanceof HTMLSelectElement) url.searchParams.set("turnoRegistro", shift.value);
          url.searchParams.delete("feedback");
          url.searchParams.delete("feedbackType");
          startTransition(() => router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false }));
        }} />
    </label> : null}
    {pending ? <p role="status" className="text-sm md:col-span-2">Carregando equipamentos da data selecionada…</p> : null}
    {children}
  </fieldset>;
}
