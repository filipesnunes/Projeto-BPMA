"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { signRetroactiveAction } from "./actions";

export function RetroactiveForm({ fields, historyPath }: { fields: Record<string, string>; historyPath: string }) {
  const [state, action, pending] = useActionState(signRetroactiveAction, { status: "", message: "" });
  const [justification,setJustification]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  return <form action={action} onReset={event=>event.preventDefault()} className="space-y-4">
    {Object.entries(fields).map(([name, value]) => <input type="hidden" name={name} value={value} key={name} />)}
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`rounded border p-3 ${state.status === "error" ? "border-red-500" : "border-emerald-500"}`}>{state.message}</p>}
    {state.status === "success" ? <Link href={historyPath} className="btn-primary">Conferir Histórico</Link> : <>
      <label className="block">Justificativa da revisão *<textarea className="bpma-input" name="justificativa" required maxLength={4000} rows={3} value={justification} onChange={event=>setJustification(event.target.value)}/></label>
      <label className="block">Confirme sua senha *<input type="password" autoComplete="current-password" className="bpma-input" name="senha" required /></label>
      <label className="flex gap-2"><input type="checkbox" name="confirmacao" value="sim" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo a revisão atual dos registros selecionados e reconheço as ressalvas apresentadas, sem reatribuir sua execução original.</label>
      <button disabled={pending} className="btn-primary">{pending ? "Registrando revisão..." : "Assinar retroativamente"}</button>
    </>}
  </form>;
}
