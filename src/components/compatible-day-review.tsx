import { reviewSignatureLabel } from "@/lib/review-presentation";
import { TemperatureSignatureIdentity } from "@/app/controle-temperatura-equipamentos/name-confirmation";
import Link from "next/link";
import {workflowReviewEligibility} from "@/lib/operational-workflow/review-eligibility";
import { SignDayForm, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { prisma } from "@/lib/prisma";
import { parseAppDateInput } from "@/lib/date-time";
import { signTemperatureWorkflowAction } from "@/app/controle-temperatura-equipamentos/workflow-actions";
import { signOilWorkflowAction } from "@/app/controle-qualidade-oleo/workflow-actions";
import { groupWorkflowAction } from "@/app/historico-operacional/group-workflow-actions";

type Module = "temperatura" | "oleo" | "amostras" | "rastreabilidade";
export async function CompatibleDayReview(props: {
  moduleCode: Module; dateInput: string; returnTo: string; canSign: boolean;
  alreadySigned: boolean; hasOperationalWarnings?: boolean;
  temperatureSummaryOnly?: boolean;
}) {
  const date = parseAppDateInput(props.dateInput);
  if (!date) return null;
  const code = props.moduleCode;
  const [units, legacyCount, legacySignature] = await Promise.all([
    prisma.fluxoOperacional.findMany({where:{modulo:code,dataReferencia:date,excluidoEm:null},include:{assinaturaVigente:true,temperatura:code==="temperatura"&&props.temperatureSummaryOnly?{select:{id:true,equipamento:true,turno:true}}:true,oleo:true,recebimento:true,amostras:{where:{excluidoEm:null},take:1,include:{servico:true}}},orderBy:{criadoEm:"asc"}}),
    code === "temperatura" ? prisma.controleTemperaturaEquipamento.count({where:{data:date,fluxoId:null}})
      : code === "oleo" ? prisma.controleQualidadeOleoRegistro.count({where:{data:date,fluxoId:null}})
      : code === "amostras" ? prisma.controleBuffetAmostraRegistro.count({where:{data:date,fluxoId:null}})
      : prisma.rastreabilidadeRecebimentoNota.count({where:{data:date,fluxoId:null}}),
    prisma.assinaturaDiariaModulo.findUnique({where:{moduloCodigo_dataReferencia:{moduloCodigo:code,dataReferencia:date}}})
  ]);
  if(code==="amostras")return <div className="space-y-2"><SupervisorSignatureStatus signature={legacySignature}/><p>Cada serviço é validado separadamente na tela do serviço. Assinaturas anteriores permanecem no histórico.</p><ul>{units.map(unit=><li key={unit.id}><Link href={`/controle-buffet-amostras/servico/${unit.chave.split(":")[0]}?data=${props.dateInput}`}>{unit.amostras[0]?.servico.nome??"Abrir serviço"} — {unit.assinaturaVigente?reviewSignatureLabel(unit.assinaturaVigente):"Consultar preenchimento e validação"}</Link></li>)}</ul>{legacyCount>0&&<p>Registros legados sem versão permanecem consultáveis. Novas assinaturas exigem regularização autorizada.</p>}</div>;
  if (!units.length) return code === "oleo" || code === "temperatura" || code === "rastreabilidade" ? <><SupervisorSignatureStatus signature={legacySignature}/>{props.canSign&&!legacySignature&&legacyCount>0&&<p>{code==="oleo"?"Para autoria histórica limitada, utilize a revisão retroativa autorizada indicada na verificação.":"Registros antigos exigem comprovação do responsável original antes da validação."}</p>}</> : <SignDayForm {...props} />;
  let eligible = units.filter(unit => unit.preenchimentoCompleto && ["COMPLETO","REABERTO"].includes(unit.estado));
  if(code === "oleo") {
    // The legacy day form is not the only valid review mechanism: individual
    // supervisor signatures use a separate permission. Show the eligible
    // individual action directly in the day's history and explain blockers.
    const { getCurrentUser } = await import("@/lib/auth-session");
    const { oilRecordSignatureEligibility } = await import("@/app/controle-qualidade-oleo/signature-policy");
    const { canSignOilSupervisor } = await import("@/lib/oil-signature-permissions");
    const { isOperationalMonthClosed } = await import("@/lib/monthly-reopening");
    const user=await getCurrentUser();
    const monthClosed=await isOperationalMonthClosed("oleo",date.getUTCMonth()+1,date.getUTCFullYear());
    const individualAllowed=Boolean(user&&canSignOilSupervisor(user,"individual"));
    const dailyAllowed=Boolean(user&&canSignOilSupervisor(user,"daily"));
    const decisions=await Promise.all(units.map(async unit=>{
      if(unit.assinaturaVigente||unit.estado==="FECHADO")return {unit,reason:unit.assinaturaVigente?reviewSignatureLabel(unit.assinaturaVigente):"Esta verificação já possui assinatura vigente.",eligible:false};
      if(!unit.preenchimentoCompleto||!["COMPLETO","REABERTO"].includes(unit.estado))return {unit,reason:"A verificação ainda não está concluída.",eligible:false};
      if(monthClosed)return {unit,reason:"Competência fechada. Solicite a reabertura autorizada.",eligible:false};
      if(!user||!individualAllowed&&!dailyAllowed)return {unit,reason:"Seu usuário não possui autorização técnica de assinatura do óleo.",eligible:false};
      if(!unit.oleo)return {unit,reason:"Verificação sem dados operacionais.",eligible:false};
      const kind=individualAllowed?"individual" as const:"daily" as const;
      const result=await oilRecordSignatureEligibility(prisma,user,unit.oleo,kind,unit.versao);
      return {unit,reason:result.reason,eligible:result.allowed};
    }));
    const signable=decisions.filter(d=>d.eligible);
    return <div className="mt-4 space-y-3" id="revisao-oleo">
      <h3 className="font-semibold">Revisão e assinatura das verificações</h3>
      {decisions.map(({unit,reason,eligible})=><section key={unit.id} className="space-y-2 rounded-lg border p-3">
        <p className="font-medium">Verificação #{unit.oleo?.id??"—"} — versão {unit.versao}</p>
        {eligible&&individualAllowed?<form action={signOilWorkflowAction} className="space-y-2">
          <input type="hidden" name="unidade" value={`${unit.id}:${unit.versao}`}/>
          <input type="hidden" name="mecanismo" value="individual"/>
          <label className="block">Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label>
          <button className="btn-primary">Assinar verificação</button>
        </form>:eligible&&dailyAllowed?<p>Esta verificação pode ser assinada na revisão diária abaixo.</p>:<p role="status" className="text-sm">{reason}</p>}
      </section>)}
      {dailyAllowed&&!individualAllowed&&signable.length>0&&<form action={signOilWorkflowAction} className="space-y-3 rounded-lg border p-4">
        <input type="hidden" name="mecanismo" value="diaria"/>
        <p className="font-medium">Revisão diária — verificações selecionadas</p>
        {signable.map(({unit})=><label className="block text-sm" key={unit.id}><input type="checkbox" name="unidade" value={`${unit.id}:${unit.versao}`} defaultChecked/> Verificação #{unit.oleo?.id} — versão {unit.versao}</label>)}
        <label className="block">Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label>
        <button className="btn-primary">Assinar verificações selecionadas</button>
      </form>}
      {legacyCount>0&&<p>Registros históricos sem vínculo de versão podem utilizar a ação Assinar retroativamente, quando elegíveis. A autoria original limitada permanece registrada em auditoria.</p>}
    </div>;
  }
  if(code==="temperatura"||code==="rastreabilidade"){
    const {getCurrentUser}=await import("@/lib/auth-session");const user=await getCurrentUser();
    const checks=await Promise.all(eligible.map(async unit=>Boolean(props.canSign&&user&&(await workflowReviewEligibility(prisma,user,code,unit.id,unit.versao,`modulo.${code}.assinar_dia`)).allowed)));
    eligible=eligible.filter((_,index)=>checks[index]);
  }
  const label = (unit: typeof units[number]) => unit.temperatura ? `${unit.temperatura.equipamento} — ${unit.temperatura.turno === "MANHA" ? "Manhã" : "Tarde"}`
    : unit.oleo ? `Verificação do óleo #${unit.oleo.id} — ${unit.oleo.temperatura ?? "Sem utilização"}`
    : unit.recebimento ? `Nota ${unit.recebimento.notaFiscal} — ${unit.recebimento.fornecedor}`
    : unit.amostras[0]?.servico.nome ?? `Serviço ${unit.chave.split(":")[0]}`;
  const action = code === "temperatura" ? signTemperatureWorkflowAction : groupWorkflowAction;
  return <div className="mt-4 space-y-4">
    <p className="text-sm">As assinaturas recentes validam somente os registros e versões indicados. Uma assinatura anterior do dia não valida alterações posteriores.</p>
    <ul className="text-sm">{units.map(unit => <li key={unit.id}>{label(unit)}: {unit.estado === "REABERTO" ? "Revisão pendente — nova assinatura necessária" : unit.assinaturaVigente ? reviewSignatureLabel(unit.assinaturaVigente) : unit.preenchimentoCompleto ? "Aguardando assinatura" : "Preenchimento em andamento"}</li>)}</ul>
    {props.canSign && eligible.length > 0 && <form action={action} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="modulo" value={code}/><input type="hidden" name="returnTo" value={props.returnTo}/>
      <input type="hidden" name="mecanismo" value={code === "temperatura" ? "diaria" : "DIARIA"}/>
      <p className="font-medium">Assinatura do dia — registros salvos</p>
      {eligible.map(unit=><label className="block text-sm" key={unit.id}><input type="checkbox" name="unidade" value={`${unit.id}:${unit.versao}`} defaultChecked/> {label(unit)} — versão {unit.versao}</label>)}
      {code === "temperatura" && <TemperatureSignatureIdentity scope={eligible.map(unit=>({id:unit.id,version:unit.versao}))}/>}
      <label className="block">Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label>
      <button className="btn-primary">Assinar dia</button>
    </form>}
    {legacyCount > 0 && <div><p className="text-sm">A revisão abaixo abrange somente os registros anteriores sem vínculo de versão.</p><SupervisorSignatureStatus signature={legacySignature}/>{code === "temperatura" || code === "rastreabilidade" ? props.canSign&&!legacySignature&&<p>Registros antigos exigem comprovação do responsável original antes da validação.</p> : <SignDayForm {...props} alreadySigned={Boolean(legacySignature)}/>}</div>}
  </div>;
}
