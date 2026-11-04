import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { formatDateInput } from "./utils";
import { cleaningReviewEligibility, cleaningReviewScope, type CleaningReviewModule } from "./signature-policy";
import { bulkSignDailyByDateAction, signWeeklyAreaSupervisorAction } from "./actions";

export async function CleaningSupervisorForm({module,date,area,returnTo}:{module:CleaningReviewModule;date:Date;area?:string;returnTo:string}){
  const user=await getCurrentUser();if(!user)return null;
  const scope=await cleaningReviewScope(prisma,module,date,area);
  const reason=cleaningReviewEligibility(user,module,scope.rows);
  if(reason)return <p className="mt-4 text-sm">{reason}</p>;
  return <form action={module==="limpeza_diaria"?bulkSignDailyByDateAction:signWeeklyAreaSupervisorAction} className="mt-4 grid gap-3 md:grid-cols-2">
    <input type="hidden" name="escopo" value={scope.token}/><input type="hidden" name="returnTo" value={returnTo}/>
    <input type="hidden" name={module==="limpeza_diaria"?"data":"weekStart"} value={formatDateInput(date)}/>
    {area&&<input type="hidden" name="area" value={area}/>}
    <p className="md:col-span-2">Revisão do supervisor operacional — {scope.rows.filter(r=>!r.assinaturaSupervisor.trim()).length} atividade(s) aguardando supervisão. Responsável: {user.nomeCompleto}.</p>
    <label>Confirme sua senha<input className="bpma-input" type="password" name="senhaConfirmacao" required autoComplete="current-password"/></label>
    <label>Observação<input className="bpma-input" name="observacaoAssinatura" maxLength={4000}/></label>
    <button className="btn-primary">Assinar revisão do supervisor</button>
  </form>;
}
