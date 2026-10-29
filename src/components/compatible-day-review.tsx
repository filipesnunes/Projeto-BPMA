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
  if (!units.length) return <SignDayForm {...props} />;
  const eligible = units.filter(unit => unit.preenchimentoCompleto && ["COMPLETO","REABERTO"].includes(unit.estado));
  const label = (unit: typeof units[number]) => unit.temperatura ? `${unit.temperatura.equipamento} — ${unit.temperatura.turno === "MANHA" ? "Manhã" : "Tarde"}`
    : unit.oleo ? `Verificação do óleo #${unit.oleo.id} — ${unit.oleo.temperatura ?? "Sem utilização"}`
    : unit.recebimento ? `Nota ${unit.recebimento.notaFiscal} — ${unit.recebimento.fornecedor}`
    : unit.amostras[0]?.servico.nome ?? `Serviço ${unit.chave.split(":")[0]}`;
  const action = code === "temperatura" ? signTemperatureWorkflowAction : code === "oleo" ? signOilWorkflowAction : groupWorkflowAction;
  return <div className="mt-4 space-y-4">
    <p className="text-sm">As assinaturas recentes validam somente os registros e versões indicados. Uma assinatura anterior do dia não valida alterações posteriores.</p>
    <ul className="text-sm">{units.map(unit => <li key={unit.id}>{label(unit)}: {unit.estado === "REABERTO" ? "Revisão pendente — nova assinatura necessária" : unit.assinaturaVigente ? `Assinado por ${unit.assinaturaVigente.usuarioNome}` : unit.preenchimentoCompleto ? "Aguardando assinatura" : "Preenchimento em andamento"}</li>)}</ul>
    {props.canSign && eligible.length > 0 && <form action={action} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="modulo" value={code}/><input type="hidden" name="returnTo" value={props.returnTo}/>
      <input type="hidden" name="mecanismo" value={code === "temperatura" || code === "oleo" ? "diaria" : "DIARIA"}/>
      <p className="font-medium">Assinatura do dia — registros salvos</p>
      {eligible.map(unit=><label className="block text-sm" key={unit.id}><input type="checkbox" name="unidade" value={`${unit.id}:${unit.versao}`} defaultChecked/> {label(unit)} — versão {unit.versao}</label>)}
      <label className="block">Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label>
      <button className="btn-primary">Assinar dia</button>
    </form>}
    {legacyCount > 0 && <div><p className="text-sm">A revisão abaixo abrange somente os registros anteriores sem vínculo de versão.</p><SupervisorSignatureStatus signature={legacySignature}/><SignDayForm {...props} alreadySigned={Boolean(legacySignature)}/></div>}
  </div>;
}
