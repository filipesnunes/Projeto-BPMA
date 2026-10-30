import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {prisma} from "@/lib/prisma";
import {getCurrentUser} from "@/lib/auth-session";
import {hasPermission} from "@/lib/permissions";
import {getAppDate,formatAppDateInput,formatAppDateTime} from "@/lib/date-time";
import {isOperationalMonthClosed} from "@/lib/monthly-reopening";
import {ImageUploadField} from "@/components/forms/image-upload-field";
import {canCorrectTemperature,canReadTemperatureDate,currentTemperatureMonth} from "./correction-policy";
import {reopenTemperatureWorkflowAction,signTemperatureWorkflowAction} from "./workflow-actions";
import { TemperatureRecordEditForm } from "./record-edit-form";
import { temperatureHistoryReturnTo, withTemperatureHistory } from "./history-navigation";
import type {TemperatureDraft} from "./workflow-adapter";

export async function TemperatureSavedRecordPage({id,query={}}:{id:number;query?:Record<string,string|string[]|undefined>}) {
  const user=await getCurrentUser();if(!user)redirect("/login");
  if(!hasPermission(user,"modulo.temperatura.acessar"))redirect("/acesso-negado");
  const unit=await prisma.fluxoOperacional.findFirst({where:{modulo:"temperatura",excluidoEm:null,temperatura:{id,excluidoEm:null}},include:{temperatura:true,assinaturaVigente:true,versoes:{orderBy:{versao:"desc"},take:1},eventos:{orderBy:{criadoEm:"desc"},take:100}}});
  const record=unit?.temperatura??await prisma.controleTemperaturaEquipamento.findUnique({where:{id}});
  if(!record||record.excluidoEm||(!unit&&record.fluxoId))notFound();
  if(!canReadTemperatureDate(user,record.data))redirect("/acesso-negado");
  const monthClosed=await isOperationalMonthClosed("temperatura",record.data.getUTCMonth()+1,record.data.getUTCFullYear());
  const signed=unit?unit.estado==="FECHADO":Boolean(record.assinaturaNutricionistaDataHora);
  const canEdit=!signed&&!monthClosed&&canCorrectTemperature(user,record.data);
  const reopen=signed&&!monthClosed&&currentTemperatureMonth(record.data)&&hasPermission(user,"modulo.temperatura.reabrir_registro");
  const canSign=!monthClosed&&!signed&&record.data<=getAppDate()&&(!unit||unit.preenchimentoCompleto)&&hasPermission(user,"modulo.temperatura.assinar_historico");
  const draft=(unit?.versoes[0]?.rascunho??{}) as TemperatureDraft;
  const url=`/controle-temperatura-equipamentos/registro/${id}`;
  const returnTo=temperatureHistoryReturnTo(Array.isArray(query.returnTo)?query.returnTo[0]:query.returnTo,record.data);
  const recordHref=(suffix="")=>withTemperatureHistory(url+suffix,returnTo);
  const hidden=<><input type="hidden" name="returnTo" value={returnTo??""}/><input type="hidden" name="chave" value={unit?.chave??`legacy:${id}`}/><input type="hidden" name="id" value={unit?.id??""}/><input type="hidden" name="versao" value={unit?.versao??0}/><input type="hidden" name="originalUpdatedAt" value={record.updatedAt.toISOString()}/></>;
  const original=draft.registroLegadoOriginal?JSON.parse(draft.registroLegadoOriginal) as {assinaturaNutricionistaNome?:string;assinaturaNutricionistaDataHora?:string;assinaturaNutricionistaUsuarioId?:number}:null;
  const versions=query.auditoria==="1"&&unit?await prisma.fluxoVersao.findMany({where:{fluxoId:unit.id},orderBy:{versao:"asc"}}):[];
  return <div className="space-y-5">
    <header className="bpma-card"><h1 className="text-xl font-semibold">{record.equipamento} — {formatAppDateInput(record.data)} — {record.turno==="MANHA"?"Manhã":"Tarde"}</h1><nav className="mt-3 flex gap-3"><Link href="/controle-temperatura-equipamentos">Registros de hoje</Link><Link href={returnTo??`/controle-temperatura-equipamentos/historico?filtroData=${formatAppDateInput(record.data)}&dia=${formatAppDateInput(record.data)}`}>Histórico</Link></nav></header>
    {query.feedback&&<p className="bpma-card" role="status">{String(query.feedback)}</p>}
    {monthClosed&&<p className="bpma-card">Competência fechada. Registro disponível somente para consulta.</p>}
    {signed&&<section className="bpma-card space-y-3"><p>Registro assinado. Solicite a reabertura a um usuário autorizado para realizar alterações.</p><p>Assinado por {unit?.assinaturaVigente?.usuarioNome??record.assinaturaNutricionistaNome??"Nome não registrado"} em {formatAppDateTime(unit?.assinaturaVigente?.assinadoEm??record.assinaturaNutricionistaDataHora!)}</p>{reopen&&<Link className="btn-secondary" href={recordHref("?confirmar=reabrir")}>Reabrir para correção</Link>}</section>}
    {unit?.estado==="REABERTO"&&<p className="bpma-card">Correção autorizada. Uma nova assinatura é necessária. A assinatura anterior permanece no histórico.</p>}
    {reopen&&query.confirmar==="reabrir"&&<form action={reopenTemperatureWorkflowAction} role="dialog" aria-label="Confirmar reabertura" className="bpma-card space-y-3">{hidden}<input type="hidden" name="confirmar" value="true"/><p>A assinatura anterior deixará de validar os dados atuais. Confirme a reabertura para correção.</p><label>Justificativa obrigatória<textarea className="bpma-input" name="justificativa" required maxLength={4000}/></label><Link className="btn-secondary" href={recordHref()}>Cancelar</Link><button className="btn-primary">Confirmar reabertura</button></form>}
    <TemperatureRecordEditForm>{hidden}<fieldset className="contents" disabled={!canEdit}>
      <label>Situação<select className="bpma-input" name="statusOperacionalEquipamento" defaultValue={draft.statusOperacionalEquipamento??record.statusOperacionalEquipamento}><option value="EM_OPERACAO">Em operação</option><option value="INATIVO">Inativo</option><option value="MANUTENCAO">Em manutenção</option></select></label>
      <label>Temperatura aferida (°C)<input className="bpma-input" inputMode="decimal" name="temperaturaAferida" defaultValue={draft.temperaturaAferida??String(record.temperaturaAferida??"")}/></label>
      <p>Horário original: {record.horarioAfericao??(record.horarioNaoInformado?"Não informado":"Não registrado")}. Responsável original: {record.responsavel}.</p>
      <label className="md:col-span-2">Observação<textarea className="bpma-input" name="observacaoStatusOperacional" defaultValue={draft.observacaoStatusOperacional??record.observacaoStatusOperacional??record.observacoes??""} maxLength={4000}/></label>
      <ImageUploadField name="fotoDesvio" label="Foto da evidência" existingImageDataUrl={draft.fotoBase64?`data:${draft.fotoMimeType};base64,${draft.fotoBase64}`:record.fotoBase64?`data:${record.fotoMimeType};base64,${record.fotoBase64}`:draft.fotoUrl||record.fotoUrl} existingFileName={draft.fotoNome||record.fotoNome} maxBytes={1024*1024} compressBeforeUpload inputClassName="bpma-input"/>
      <p className="md:col-span-2">A ação corretiva segue as regras sanitárias do equipamento. As correções preservam os dados anteriores para auditoria.</p>
      <button className="btn-primary" name="intent" value="complete">Salvar Alterações</button>
    </fieldset></TemperatureRecordEditForm>
    {canSign&&<form action={signTemperatureWorkflowAction} className="bpma-card space-y-3">{unit?<input type="hidden" name="unidade" value={`${unit.id}:${unit.versao}`}/>:<><input type="hidden" name="legacyRecordId" value={id}/><input type="hidden" name="originalUpdatedAt" value={record.updatedAt.toISOString()}/></>}<input type="hidden" name="mecanismo" value="individual"/><h2>Assinatura da nutricionista / supervisor autorizado</h2><label>Confirme sua senha<input className="bpma-input" name="senha" type="password" required autoComplete="current-password"/></label><button className="btn-primary">Assinar registro</button></form>}
    {unit&&<section className="bpma-card space-y-3"><h2 className="font-semibold">Histórico e rastreabilidade</h2>{original?.assinaturaNutricionistaDataHora&&<p>Assinatura legada preservada: {original.assinaturaNutricionistaNome??"Nome não registrado"} — {formatAppDateTime(new Date(original.assinaturaNutricionistaDataHora))}. Evidência original, sem vigência após a reabertura.</p>}<ul>{unit.eventos.map(event=><li key={event.id}>{formatAppDateTime(event.criadoEm)} — {event.usuarioNome} — {event.operacao} — versão {event.versaoNova}{event.operacao==="REABERTURA"?` — ${event.justificativa}`:""}{event.operacao==="CORRECAO_REGISTRO"&&event.justificativa&&<details><summary>Campos alterados e vínculo de reabertura</summary><pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(JSON.parse(event.justificativa),null,2)}</pre></details>}</li>)}</ul><Link className="btn-secondary" href={recordHref("?auditoria=1")}>Consultar valores anteriores e assinaturas</Link>
      {versions.map(version=>{const values=version.dados as Record<string,unknown>;const stored=version.rascunho as TemperatureDraft;return <div key={version.versao} className="border-t py-3"><p>Versão {version.versao} — {version.usuarioNome} — {formatAppDateTime(version.criadoEm)}</p><p>Temperatura: {String(values.temperaturaAferida??stored.temperaturaAferida??"Não preenchida")} — Responsável: {String(values.responsavel??record.responsavel)} — Horário: {String(values.horarioAfericao??stored.horarioAfericao??"Não registrado")}</p><p>Observações: {String(values.observacoes??values.observacaoStatusOperacional??stored.observacaoStatusOperacional??"")}</p><p>Ação corretiva: {String(values.acaoCorretiva??"Não aplicável")}. Evidências de imagem permanecem na versão original.</p></div>;})}
    </section>}
  </div>;
}
