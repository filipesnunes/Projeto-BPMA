"use client";
import { useState } from "react";
import { deleteOperationalRecordAction } from "@/app/historico-operacional/delete-action";
import type { DeletionTarget } from "@/lib/operational-deletion";

export function OperationalDeleteButton({ target, id, date, description }: { target: DeletionTarget; id: number; date: string; description: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn-danger" onClick={() => setOpen(true)}>Excluir registro</button>
    {open && <div className="bpma-modal-backdrop"><div role="dialog" aria-modal="true" aria-labelledby={`delete-${target}-${id}`} className="bpma-modal-panel max-w-lg">
      <h3 id={`delete-${target}-${id}`} className="font-semibold">Confirmar exclusão do registro</h3>
      <p className="my-3 text-sm">{description}</p>
      <form action={deleteOperationalRecordAction} className="space-y-3">
        <input type="hidden" name="target" value={target} /><input type="hidden" name="id" value={id} /><input type="hidden" name="exclusaoData" value={date} />
        <label className="block text-sm">Justificativa da exclusão *<textarea name="justificativaExclusao" required maxLength={4000} className="bpma-input" /></label>
        <p className="text-xs">O registro e suas assinaturas serão preservados para auditoria.</p>
        <div className="btn-group"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="btn-danger">Confirmar exclusão</button></div>
      </form>
    </div></div>}
  </>;
}
