import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { formatAppDateInput, formatAppDateTime } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { canCorrectOil, canReadOilDate, currentOilMonth } from "./correction-policy";
import { legacyOilSignature } from "./legacy-workflow";
import { OilRegisterFields } from "./oil-register-fields";
import { NO_OIL_STRIP } from "./strip-choice";
import { getStatusLabel } from "./utils";
import { saveOilWorkflowAction, reopenOilWorkflowAction, signOilWorkflowAction } from "./workflow-actions";

export async function OilSavedRecordPage({id,query={}}:{id:number;query?:Record<string,string|string[]|undefined>}) {
  const user=await getCurrentUser();if(!user)redirect("/login");
  const record=await prisma.controleQualidadeOleoRegistro.findUnique({where:{id}});
  if(!record||record.excluidoEm)notFound();
  if(!canReadOilDate(user,record.data))redirect("/acesso-negado");
  const unit=record.fluxoId?await prisma.fluxoOperacional.findUnique({where:{id:record.fluxoId,modulo:"oleo",excluidoEm:null},include:{assinaturaVigente:true,versoes:{orderBy:{versao:"desc"},take:1},eventos:{orderBy:{criadoEm:"desc"}}}}):null;
  if(record.fluxoId&&!unit)notFound();
  const legacy=unit?null:await legacyOilSignature(prisma,record);
  const signed=unit?unit.estado==="FECHADO"||Boolean(unit.assinaturaVigenteId):Boolean(legacy?.signed);
  const monthClosed=await isOperationalMonthClosed("oleo",record.data.getUTCMonth()+1,record.data.getUTCFullYear());
  const canEdit=!signed&&!monthClosed&&canCorrectOil(user,record.data);
  const canReopen=signed&&!monthClosed&&currentOilMonth(record.data)&&hasPermission(user,"modulo.oleo.reabrir_registro");
  const canSign=!signed&&!monthClosed&&(!unit||unit.preenchimentoCompleto)&&hasPermission(user,"modulo.oleo.assinar_historico");
  const options=await prisma.controleQualidadeOleoOpcaoFita.findMany({orderBy:[{ordem:"asc"},{rotulo:"asc"}]});
  const fieldOptions=options.filter(option=>option.ativo||option.rotulo===record.fitaOleo);
  if(record.fitaOleo&&!fieldOptions.some(option=>option.rotulo===record.fitaOleo)&&record.status)fieldOptions.push({id:0,rotulo:record.fitaOleo,descricao:record.orientacao,statusAssociado:record.status,ordem:0,ativo:false,createdAt:record.createdAt,updatedAt:record.updatedAt});
  const url=`/controle-qualidade-oleo/registro/${id}`;
  const hidden=<><input type="hidden" name="chave" value={unit?.chave??`legacy:${id}`}/><input type="hidden" name="id" value={unit?.id??""}/><input type="hidden" name="versao" value={unit?.versao??0}/><input type="hidden" name="originalUpdatedAt" value={record.updatedAt.toISOString()}/></>;
  const signatureName=unit?.assinaturaVigente?.usuarioNome??record.assinaturaSupervisorNome??legacy?.daily?.usuarioNomeSnapshot??"Nome não registrado";
  const signatureDate=unit?.assinaturaVigente?.assinadoEm??record.assinaturaSupervisorEm??legacy?.daily?.assinadoEm;
  const versions=query.auditoria==="1"&&unit?await prisma.fluxoVersao.findMany({where:{fluxoId:unit.id},orderBy:{versao:"asc"}}):[];
  const signatures=unit?await prisma.fluxoAssinaturaVinculo.findMany({where:{fluxoId:unit.id},include:{assinatura:true}}):[];
  const original=unit?.versoes[0]?.rascunho as Record<string,string>|undefined;
  return <div className="space-y-5">
    <header className="bpma-card"><h1 className="text-xl font-semibold">Verificação do óleo #{id} — {formatAppDateInput(record.data)}</h1><nav className="mt-3 flex gap-3"><Link href="/controle-qualidade-oleo">Registros de hoje</Link><Link href={`/controle-qualidade-oleo/historico?dia=${formatAppDateInput(record.data)}`}>Histórico</Link></nav></header>
    {query.feedback&&<p className="bpma-card" role="status">{String(query.feedback)}</p>}
    {monthClosed&&<p className="bpma-card">Competência fechada. Registro disponível somente para consulta.</p>}
    {signed&&<section className="bpma-card space-y-3"><p>Registro assinado</p><p>Este registro já foi assinado. Solicite a reabertura à nutricionista ou a um usuário autorizado para realizar alterações.</p><p>Assinado por {signatureName}{signatureDate?` em ${formatAppDateTime(signatureDate)}`:""}</p>{canReopen&&<Link className="btn-secondary" href={`${url}?confirmar=reabrir`}>Reabrir para correção</Link>}</section>}
    {unit?.estado==="REABERTO"&&<p className="bpma-card">Correção autorizada. Aguardando nova assinatura. A assinatura anterior permanece no histórico.</p>}
    {canReopen&&query.confirmar==="reabrir"&&<form action={reopenOilWorkflowAction} role="dialog" aria-label="Confirmar reabertura" className="bpma-card space-y-3">{hidden}<p>A assinatura anterior deixará de validar somente esta verificação. Os dados e as evidências anteriores serão preservados.</p><input type="hidden" name="confirmar" value="true"/><label>Justificativa obrigatória<textarea className="bpma-input" name="justificativa" required maxLength={4000}/></label><Link className="btn-secondary" href={url}>Cancelar</Link><button className="btn-primary">Confirmar reabertura</button></form>}
    <form key={`${id}:${unit?.versao??record.updatedAt.toISOString()}`} action={saveOilWorkflowAction} className="bpma-card grid gap-4 md:grid-cols-2">{hidden}<fieldset className="contents" disabled={!canEdit}>
      <OilRegisterFields options={fieldOptions} defaultFita={record.fitaOleo||NO_OIL_STRIP} defaultTemperatura={String(record.temperatura??"")} defaultSemUtilizacao={record.semUtilizacao} inputClassName="bpma-input"/>
      <p className="md:col-span-2">Responsável original: {record.responsavel}. Horário original: {record.horarioExecucao??(record.horarioNaoInformado?"Não informado":"Não registrado")}. Resultado salvo: {getStatusLabel(record.status)}.</p>
      <label className="md:col-span-2">Observação<textarea className="bpma-input" name="observacao" defaultValue={record.observacao??""} maxLength={4000}/></label>
      <button className="btn-primary" name="intent" value="complete">Salvar Alterações</button>
    </fieldset></form>
    {canSign&&<form action={signOilWorkflowAction} className="bpma-card space-y-3">{unit?<input type="hidden" name="unidade" value={`${unit.id}:${unit.versao}`}/>:<><input type="hidden" name="legacyRecordId" value={id}/><input type="hidden" name="originalUpdatedAt" value={record.updatedAt.toISOString()}/></>}<input type="hidden" name="mecanismo" value="individual"/><h2>Assinatura da nutricionista / responsável autorizado</h2><label>Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label><button className="btn-primary">Assinar registro</button></form>}
    {unit&&<section className="bpma-card space-y-3"><h2 className="font-semibold">Histórico de alterações e assinaturas</h2>
      {(original?.registroLegadoOriginal||original?.assinaturaDiariaOriginal)&&<details><summary>Evidência legada original preservada</summary><p>A evidência antiga não valida as correções posteriores.</p><pre className="whitespace-pre-wrap break-all text-xs">{original.registroLegadoOriginal}{"\n"}{original.assinaturaDiariaOriginal}</pre></details>}
      <ul>{signatures.map(link=><li key={link.assinaturaId}>Assinatura de {link.assinatura.usuarioNome} — {formatAppDateTime(link.assinatura.assinadoEm)} — versão {link.versao} — {unit.assinaturaVigenteId===link.assinaturaId?"Vigente":"Histórica"}</li>)}</ul>
      <ul>{unit.eventos.map(event=><li key={event.id}>{formatAppDateTime(event.criadoEm)} — {event.usuarioNome} — {event.operacao}{event.justificativa&&<details><summary>Justificativa / campos alterados</summary><pre className="whitespace-pre-wrap break-all text-xs">{event.justificativa}</pre></details>}</li>)}</ul>
      <Link className="btn-secondary" href={`${url}?auditoria=1`}>Consultar valores anteriores</Link>
      {versions.map(version=><details key={version.versao}><summary>Versão {version.versao} — {version.usuarioNome} — {formatAppDateTime(version.criadoEm)}</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(version.dados,null,2)}</pre></details>)}
    </section>}
  </div>;
}
