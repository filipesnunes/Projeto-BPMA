"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { reopenModuleMonthlyClosureAction } from "@/app/historico-operacional/actions";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">
    {pending ? "Reabrindo..." : "Confirmar Reabertura"}
  </button>;
}

export function ReopenMonthForm({ moduleCode, month, year, returnTo }: {
  moduleCode: OperationalSignatureModuleCode; month: number; year: number; returnTo: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Reabrir Mês</button>
    {open ? <div className="bpma-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar Reabertura">
      <section className="bpma-modal-panel max-w-md">
        <h3 className="text-lg font-semibold">Confirmar Reabertura</h3>
        <p className="mt-2 text-sm">Confirma a reabertura de {String(month).padStart(2, "0")}/{year}?
          O fechamento anterior será preservado na auditoria e as assinaturas diárias serão mantidas.</p>
        <form action={reopenModuleMonthlyClosureAction} className="mt-5 btn-group">
          <input type="hidden" name="moduloCodigo" value={moduleCode} />
          <input type="hidden" name="mes" value={month} />
          <input type="hidden" name="ano" value={year} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <ConfirmButton />
        </form>
      </section>
    </div> : null}
  </>;
}
