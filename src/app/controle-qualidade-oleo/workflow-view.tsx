import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { canDeleteOperationalRecord } from "@/lib/operational-deletion-permission";
import { formatAppDateInput, getAppDate, parseAppDateInput } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { assertWorkflowEdit } from "@/lib/operational-workflow/policy";
import { canSignModuleDay } from "@/lib/module-signatures";
import { ProcedureTimeAudit } from "@/components/procedure-time-audit";
import { OilRegisterFields } from "./oil-register-fields";
import { NO_OIL_STRIP } from "./strip-choice";
import { canReadOilDate } from "./correction-policy";
import { OilSavedRecordPage } from "./saved-record-page";
import { getNextOilStripDate, getStatusLabel } from "./utils";
import { parseOilKey, type OilDraft } from "./workflow-adapter";
import { saveOilWorkflowAction, reopenOilWorkflowAction, signOilWorkflowAction, deleteOilWorkflowAction } from "./workflow-actions";
export type OilQuery = Record<string,string|string[]|undefined>;
const base="/controle-qualidade-oleo";
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]??"":v??"";
async function actor() { const user=await getCurrentUser(); if(!user)redirect("/login");if(!hasPermission(user,"modulo.oleo.acessar"))redirect("/acesso-negado");return user; }
const historyAllowed=(user: Awaited<ReturnType<typeof actor>>)=>hasPermission(user,"modulo.oleo.acessar_historico")||hasPermission(user,"modulo.oleo.editar_historico");
function Feedback({query}:{query:OilQuery}) { return query.feedback?<p className="bpma-card" role="status">{first(query.feedback)}</p>:null; }
function State({value}:{value:string}) { return <span className={value==="REABERTO"?"rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900":"font-medium"}>{value}{value==="REABERTO"?" — Nova assinatura pendente":""}</span>; }
export async function OilWorkflowList({query,history=false}:{query:OilQuery;history?:boolean}) {
 const user=await actor(),today=getAppDate(),todayText=formatAppDateInput(today),full=historyAllowed(user);
 const start=history&&full?parseAppDateInput(first(query.inicio))??parseAppDateInput(first(query.data))??today:today;
 const end=history&&full?parseAppDateInput(first(query.fim))??start:start;
 const flows=await prisma.fluxoOperacional.findMany({where:{modulo:"oleo",excluidoEm:null,dataReferencia:history?{gte:start,lte:end}:today,...(!history?{OR:[{estado:"REABERTO"},{estado:"PENDENTE"}]}:{})},include:{oleo:true,assinaturaVigente:true,versoes:{orderBy:{versao:"desc"},take:1}},orderBy:[{dataReferencia:"desc"},{criadoEm:"desc"}]});
 const groups=new Map<string,typeof flows>();for(const unit of flows.filter(u=>u.preenchimentoCompleto&&["COMPLETO","REABERTO"].includes(u.estado))){const d=formatAppDateInput(unit.dataReferencia);groups.set(d,[...(groups.get(d)??[]),unit]);}
 return <div className="space-y-6"><header className="bpma-card"><h1 className="text-xl font-semibold">{history?"Histórico — Controle da Qualidade do Óleo":"Controle da Qualidade do Óleo"}</h1><p>{history?"Verificações, responsáveis e validações por período.":"Verificações iniciadas e pendentes de hoje, além das reabertas de qualquer data."}</p><nav className="mt-3 flex flex-wrap gap-3"><Link className="btn-primary" href={`${base}/fluxo`}>Nova Verificação</Link><Link className="btn-secondary" href={history?base:`${base}/historico`}>{history?"Pendências":"Histórico"}</Link><Link className="btn-secondary" href={`${base}/legado`}>Registros legados</Link>{full&&<Link className="btn-secondary" href={`${base}/historico/legado`}>Fechamento mensal e histórico legado</Link>}{hasPermission(user,"modulo.oleo.gerenciar_cadastros")&&<Link className="btn-secondary" href={`${base}/opcoes`}>Gerenciar Opções</Link>}<a className="btn-secondary" target="_blank" rel="noreferrer" href={`/relatorios/controle-qualidade-oleo/mensal?mes=${start.getUTCMonth()+1}&ano=${start.getUTCFullYear()}`}>Relatório mensal</a></nav></header>
 <Feedback query={query}/>{history&&<form method="get" className="bpma-card flex flex-wrap gap-3"><label>De<input type="date" className="bpma-input" name="inicio" defaultValue={formatAppDateInput(start)} max={todayText} readOnly={!full}/></label><label>Até<input type="date" className="bpma-input" name="fim" defaultValue={formatAppDateInput(end)} max={todayText} readOnly={!full}/></label><button className="btn-primary">Consultar</button></form>}
 <section className="bpma-card overflow-x-auto"><table className="w-full text-sm [&_th]:p-3 [&_td]:p-3 [&_th]:text-left [&_tr]:border-b"><thead><tr><th>Verificação</th><th>Data</th><th>Temperatura / Fita</th><th>Resultado sanitário</th><th>Responsável</th><th>Estado operacional</th><th>Assinatura vigente</th><th>Ação</th></tr></thead><tbody>{flows.map(unit=><tr key={unit.id}><td>{unit.oleo?`#${unit.oleo.id}`:"Rascunho"}</td><td>{formatAppDateInput(unit.dataReferencia)}</td><td>{unit.preenchimentoCompleto?`${unit.oleo?.temperatura??"—"} °C / ${unit.oleo?.fitaOleo??"Sem aferição da fita"}`:"Preenchimento parcial"}</td><td>{unit.preenchimentoCompleto?getStatusLabel(unit.oleo?.status??null):"—"}</td><td>{unit.versoes[0]?.usuarioNome}</td><td><State value={unit.estado}/></td><td>{unit.assinaturaVigente?.usuarioNome??"Pendente"}</td><td><Link className="btn-secondary" href={`${base}/fluxo?chave=${encodeURIComponent(unit.chave)}`}>Abrir</Link></td></tr>)}{!flows.length&&<tr><td colSpan={8}>Nenhuma verificação nesta listagem.</td></tr>}</tbody></table></section>
 {history&&canSignModuleDay(user,"oleo")&&Array.from(groups,([day,units])=><form key={day} action={signOilWorkflowAction} className="bpma-card space-y-3"><h2 className="font-semibold">Revisão diária — {day}</h2><p>Serão validadas somente as verificações e versões selecionadas.</p><input type="hidden" name="mecanismo" value="diaria"/>{units.map(u=><label className="block" key={u.id}><input type="checkbox" name="unidade" value={`${u.id}:${u.versao}`}/> Verificação #{u.oleo?.id} — {u.oleo?.temperatura??"Sem utilização"} — versão {u.versao}</label>)}<label>Confirme sua senha<input className="bpma-input" type="password" name="senha" required autoComplete="current-password"/></label><button className="btn-primary">Assinar verificações selecionadas</button></form>)}
 </div>;
}
export async function OilWorkflowEditor({query}:{query:OilQuery}) {
 const user=await actor(),today=formatAppDateInput(getAppDate());const key=first(query.chave);
 if(!key)return redirect(`${base}?new=1`);
 const stored=await prisma.controleQualidadeOleoRegistro.findFirst({where:{fluxo:{modulo:"oleo",chave:key},excluidoEm:null}});
 if(stored)return OilSavedRecordPage({id:stored.id,query});
 if(/^legacy:\d+$/.test(key))return OilSavedRecordPage({id:Number(key.split(":")[1]),query});
 let date:Date;try{date=parseOilKey(key).date;}catch{return <p>Identificação inválida. <Link href={`${base}/fluxo`}>Iniciar nova verificação</Link></p>;}
 const [unit,options,last,monthClosed]=await Promise.all([
 prisma.fluxoOperacional.findUnique({where:{modulo_chave:{modulo:"oleo",chave:key}},include:{oleo:true,assinaturaVigente:true,versoes:{orderBy:{versao:"desc"},take:1},eventos:{orderBy:{criadoEm:"desc"}}}}),
 prisma.controleQualidadeOleoOpcaoFita.findMany({orderBy:[{ordem:"asc"},{rotulo:"asc"}]}),
 prisma.controleQualidadeOleoRegistro.findFirst({where:{semUtilizacao:false,fitaOleo:{not:null},NOT:{fitaOleo:""},data:{lte:getAppDate()}},select:{data:true},orderBy:[{data:"desc"},{createdAt:"desc"}]}),
 isOperationalMonthClosed("oleo",date.getUTCMonth()+1,date.getUTCFullYear())]);
 if(unit?.excluidoEm)return <p>Verificação excluída com auditoria.</p>;
 if(unit&&!canReadOilDate(user,date))return <p>Sem acesso a esta data.</p>;
 let canEdit=!monthClosed;try{assertWorkflowEdit({user,module:"oleo",date,today:getAppDate(),creating:!unit});}catch{canEdit=false;}
 const closed=unit?.estado==="FECHADO",canReopen=!monthClosed&&hasPermission(user,"modulo.oleo.reabrir_registro"),fromEdit=first(query.origem)==="editar";
 const draft=(unit?.versoes[0]?.rascunho??{}) as OilDraft;
 const url=`${base}/fluxo?chave=${encodeURIComponent(key)}`;
 const hidden=<><input type="hidden" name="chave" value={key}/><input type="hidden" name="id" value={unit?.id??""}/><input type="hidden" name="versao" value={unit?.versao??0}/></>;
 return <div className="space-y-5"><header className="bpma-card"><h1 className="text-xl font-semibold">Verificação {unit?.oleo?`#${unit.oleo.id}`:"da qualidade do óleo"} — {formatAppDateInput(date)}</h1><p>{unit?.estado==="REABERTO"?"Revisão pendente — nova assinatura necessária":unit?.assinaturaVigente?"Registro assinado":"Preenchimento salvo"}</p><nav className="mt-3 flex gap-3"><Link href={base}>Voltar ao módulo</Link><Link href={`${base}/historico?data=${formatAppDateInput(date)}`}>Histórico</Link></nav></header><Feedback query={query}/>
 {monthClosed&&<p className="bpma-card">Competência fechada. Consulta somente.</p>}
 {closed&&<section className="bpma-card"><p>Validado por {unit.assinaturaVigente?.usuarioNome}. A assinatura anterior será preservada no histórico.</p>{canReopen&&<Link className="btn-secondary" href={`${url}&confirmar=reabrir`}>Reabrir Registro</Link>}{canReopen&&canEdit&&<Link className="btn-secondary" href={`${url}&confirmar=reabrir&origem=editar`}>Editar</Link>}</section>}
 {closed&&canReopen&&first(query.confirmar)==="reabrir"&&(!fromEdit||canEdit)&&<form role="dialog" aria-label="Confirmar reabertura" action={reopenOilWorkflowAction} className="bpma-card space-y-3">{hidden}<input type="hidden" name="confirmar" value="true"/><input type="hidden" name="origem" value={fromEdit?"editar":"reabrir"}/><p>Esta verificação já foi fechada. Reabrir retira a vigência da assinatura atual e exige nova assinatura, mesmo sem alteração dos dados.</p><label>Justificativa<textarea className="bpma-input" name="justificativa" required maxLength={4000}/></label><Link className="btn-secondary" href={url}>Cancelar</Link><button className="btn-primary">Confirmar reabertura</button></form>}
 <form key={`${key}:${unit?.versao??0}`} action={saveOilWorkflowAction} className="bpma-card grid gap-4 md:grid-cols-2">{hidden}<fieldset className="contents" disabled={!canEdit||closed}>
 <OilRegisterFields options={options.filter(option=>option.ativo||option.rotulo===draft.fitaOleo)} defaultFita={draft.fitaOleo || (unit?.oleo ? unit.oleo.fitaOleo || NO_OIL_STRIP : "")} defaultTemperatura={draft.temperatura} defaultSemUtilizacao={draft.semUtilizacao==="true"} inputClassName="bpma-input" previsaoFita={last?`Última aferição da fita: ${formatAppDateInput(last.data)}. Próxima prevista: ${formatAppDateInput(getNextOilStripDate(last.data))}.`:"Nenhuma aferição anterior da fita registrada."}/>
 <label>Horário da verificação<input className="bpma-input" name="horarioExecucao" type="time" readOnly={formatAppDateInput(date)===today} defaultValue={draft.horarioExecucao??""}/><span className="text-xs">{formatAppDateInput(date)===today?"Automático ao concluir hoje.":"Informe o horário real, quando houver utilização."}</span></label>
 {formatAppDateInput(date)<today&&<label><input type="checkbox" name="horarioNaoInformado" value="true" defaultChecked={draft.horarioNaoInformado==="true"}/> Horário desconhecido<textarea className="bpma-input" name="justificativaHorario" defaultValue={draft.justificativaHorario??""} placeholder="Justificativa do horário desconhecido" maxLength={4000}/></label>}
 <label className="md:col-span-2">Observações<textarea className="bpma-input" name="observacao" defaultValue={draft.observacao??""} maxLength={4000}/></label><p>Responsável: {user.nomeCompleto}</p><div className="md:col-span-2 flex gap-3"><button className="btn-primary" name="intent" value="draft" formNoValidate>Salvar Registro</button></div></fieldset></form>
 {unit?.oleo&&unit.preenchimentoCompleto&&<section className="bpma-card"><p>Resultado sanitário: {getStatusLabel(unit.oleo.status)} — {unit.oleo.orientacao}</p><p>Responsável pelo preenchimento: {unit.oleo.responsavel}</p><ProcedureTimeAudit record={unit.oleo}/></section>}
 {unit&&!monthClosed&&unit.preenchimentoCompleto&&["COMPLETO","REABERTO"].includes(unit.estado)&&hasPermission(user,"modulo.oleo.assinar_historico")&&<form action={signOilWorkflowAction} className="bpma-card space-y-3"><input type="hidden" name="unidade" value={`${unit.id}:${unit.versao}`}/><input type="hidden" name="mecanismo" value="individual"/><h2>Revisão individual do supervisor</h2><label>Confirme sua senha<input type="password" className="bpma-input" name="senha" required autoComplete="current-password"/></label><button className="btn-primary">Validar verificação</button></form>}
 {unit?.oleo&&unit.preenchimentoCompleto&&!closed&&!monthClosed&&canDeleteOperationalRecord(user,"oleo")&&<details className="bpma-card"><summary>Excluir verificação</summary><form action={deleteOilWorkflowAction}>{hidden}<input type="hidden" name="registroId" value={unit.oleo.id}/><p>Excluir somente a verificação #{unit.oleo.id}, de {formatAppDateInput(date)}.</p><textarea className="bpma-input" name="justificativa" required maxLength={4000} placeholder="Justificativa obrigatória"/><button className="btn-secondary">Confirmar exclusão</button></form></details>}
 {unit&&<section className="bpma-card"><h2>Histórico desta verificação</h2><ol>{unit.eventos.map(e=><li key={e.id}>{e.criadoEm.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} — {e.operacao} — {e.usuarioNome} — versão {e.versaoNova} {e.justificativa??""}</li>)}</ol></section>}
 </div>;
}
