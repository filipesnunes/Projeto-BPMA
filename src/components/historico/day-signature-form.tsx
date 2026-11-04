"use client";
import { useActionState } from "react";
import Link from "next/link";
import { signModuleDayState } from "@/app/historico-operacional/actions";

export function DaySignatureForm({ fields, historyPath }: { fields: Record<string,string>; historyPath: string }) {
  const [state, action, pending] = useActionState(signModuleDayState, {status:"",message:""});
  return <form action={action} className="mt-4 space-y-3 rounded border p-4">
    {Object.entries(fields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}
    {state.message&&<p role={state.status==="error"?"alert":"status"} className="rounded border p-3">{state.message}</p>}
    {state.status==="success"?<Link href={historyPath} className="btn-primary">Conferir Histórico atualizado</Link>:<>
      <p>Revisão técnica do dia. As execuções devem estar assinadas pelos respectivos responsáveis.</p>
      <label className="block">Confirme sua senha *<input type="password" required autoComplete="current-password" name="senhaConfirmacao" className="bpma-input"/></label>
      <label className="block">Observação da revisão<textarea name="observacao" rows={2} maxLength={4000} className="bpma-input"/></label>
      <button disabled={pending} className="btn-primary">{pending?"Assinando...":"Assinar dia"}</button>
    </>}
  </form>;
}
