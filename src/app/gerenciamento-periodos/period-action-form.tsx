"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { closePeriodAction, reopenPeriodAction } from "./actions";

function ConfirmButton({ close }: { close: boolean }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="btn-primary" type="submit">{pending ? "Processando..." : close ? "Confirmar fechamento" : "Confirmar reabertura"}</button>;
}
export function PeriodActionForm({ code, month, year, close = false }: { code: OperationalSignatureModuleCode; month: number; year: number; close?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>{close ? "Fechar mês" : "Reabrir mês"}</button>
    {open ? <div className="bpma-modal-backdrop" role="dialog" aria-modal="true" aria-label={close ? "Confirmar fechamento" : "Confirmar reabertura"}>
      <section className="bpma-modal-panel max-w-lg">
        <h2 className="text-lg font-semibold">{close ? "Fechar novamente" : "Reabrir"} {String(month).padStart(2, "0")}/{year}</h2>
        <p className="mt-3 text-sm">{close ? "Após o fechamento, os registros deste mês voltarão a ficar bloqueados para alterações conforme as regras do módulo." : "Os registros deste período poderão voltar a ser acessados e atualizados pelos usuários autorizados. O período permanecerá reaberto até um novo fechamento pelo Gerenciamento de Períodos. As assinaturas diárias serão preservadas."}</p>
        <form action={close ? closePeriodAction : reopenPeriodAction} className="mt-4 space-y-3">
          <input type="hidden" name="moduloCodigo" value={code} />
          <input type="hidden" name="mes" value={month} /><input type="hidden" name="ano" value={year} />
          <input type="hidden" name="confirmacao" value="sim" />
          {close ? <>
            <label className="block text-sm">Confirme sua senha *<input required type="password" name="senhaConfirmacao" className="bpma-input" /></label>
            <label className="block text-sm">Observação do fechamento<textarea name="observacao" rows={2} className="bpma-input" /></label>
          </> : null}
          <div className="btn-group"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><ConfirmButton close={close} /></div>
        </form>
      </section>
    </div> : null}
  </>;
}
