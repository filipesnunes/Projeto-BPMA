"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveTemperatureRecordAction } from "./workflow-actions";

export function TemperatureRecordEditForm({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    setError("");
    // Manual submission keeps all inputs, including uploaded files, on failure.
    startTransition(async () => {
      try { setError((await saveTemperatureRecordAction(form)).error); }
      catch { setError("Não foi possível confirmar o salvamento. Os campos foram mantidos; tente novamente."); }
    });
  }
  return <form onSubmit={submit} className="bpma-card grid gap-4 md:grid-cols-2" aria-busy={pending}>
    {error && <p role="alert" className="md:col-span-2 text-red-700 dark:text-red-300">{error}</p>}
    {pending && <p role="status" className="md:col-span-2">Salvando alterações…</p>}
    <fieldset disabled={pending} className="contents">{children}</fieldset>
  </form>;
}
