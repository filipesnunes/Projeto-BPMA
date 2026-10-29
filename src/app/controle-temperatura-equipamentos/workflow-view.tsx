import { TemperatureSavedRecordPage } from "./saved-record-page";
import { legacyTemperatureId } from "./legacy-workflow";
import { currentTemperatureMonth, canReadTemperatureDate } from "./correction-policy";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { getAppDate, formatAppDateInput, parseAppDateInput } from "@/lib/date-time";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { assertWorkflowEdit } from "@/lib/operational-workflow/policy";
import { canSignModuleDay } from "@/lib/module-signatures";
import { parseTemperatureKey, type TemperatureDraft } from "./workflow-adapter";
import { saveTemperatureWorkflowAction, signTemperatureWorkflowAction, reopenTemperatureWorkflowAction, deleteTemperatureWorkflowAction } from "./workflow-actions";
import { ImageUploadField } from "@/components/forms/image-upload-field";

export type WorkflowQuery = Record<string, string | string[] | undefined>;
const base = "/controle-temperatura-equipamentos";
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
export async function workflowUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "modulo.temperatura.acessar")) redirect("/acesso-negado");
  return user;
}
function Feedback({ query }: { query: WorkflowQuery }) {
  return query.feedback ? <p role="status" className="bpma-card">{first(query.feedback)}</p> : null;
}
export async function TemperatureWorkflowList({ query, history = false }: { query: WorkflowQuery; history?: boolean }) {
  const user = await workflowUser(); const today = formatAppDateInput(getAppDate());
  const fullHistory = hasPermission(user, "modulo.temperatura.acessar_historico") || hasPermission(user, "modulo.temperatura.editar_historico");
  const date = history && fullHistory && parseAppDateInput(first(query.data)) ? first(query.data) : today;
  const [flows, equipment, legacy] = await Promise.all([
    prisma.fluxoOperacional.findMany({ where: { modulo: "temperatura", excluidoEm: null,
      ...(history ? { dataReferencia: new Date(`${date}T00:00:00Z`) } : { OR: [{ estado: "REABERTO" }, { estado: "PENDENTE", dataReferencia: getAppDate() }] })
    }, orderBy: [{ dataReferencia: "desc" }, { chave: "asc" }], include: { temperatura: true, assinaturaVigente: true } }),
    prisma.controleTemperaturaEquipamentoOpcao.findMany({ where: { tipo: "EQUIPAMENTO", ativo: true }, orderBy: { nome: "asc" } }),
    prisma.controleTemperaturaEquipamento.findMany({ where: { data: getAppDate(), fluxoId: null }, select: { equipamento: true, turno: true } })
  ]);
  const allToday = !history ? await prisma.fluxoOperacional.findMany({ where: { modulo: "temperatura", dataReferencia: getAppDate(), excluidoEm: null }, select: { chave: true } }) : [];
  const known = new Set(allToday.map(unit => unit.chave.split(":").slice(0,3).join(":")));
  const expected = history ? [] : equipment.flatMap(item => (["MANHA", "TARDE"] as const).filter(shift =>
    (shift === "MANHA" ? item.turnoManha : item.turnoTarde) && !known.has(`${item.id}:${today}:${shift}`) && !legacy.some(record => record.equipamento === item.nome && record.turno === shift)
  ).map(shift => ({ key: `${item.id}:${today}:${shift}`, name: item.nome, shift })));
  const eligible = flows.filter(unit => unit.preenchimentoCompleto && ["COMPLETO", "REABERTO"].includes(unit.estado));
  return <div className="space-y-6">
    <header className="bpma-card"><h1 className="text-xl font-semibold">{history ? "Histórico — Temperatura dos Equipamentos" : "Controle de Temperatura dos Equipamentos"}</h1>
      <p>{history ? "Preenchimentos, aferições e validações por data." : "Pendências de hoje e aferições reabertas aguardando nova assinatura."}</p>
      <nav className="mt-3 flex flex-wrap gap-3"><Link className="btn-secondary" href={`${base}/legado`}>Aferições legadas</Link><Link className="btn-secondary" href={history ? base : `${base}/historico`}>{history ? "Pendências" : "Histórico"}</Link>
        <Link className="btn-primary" href={`${base}/fluxo`}>Novo Registro / Outra Data</Link>
        {hasPermission(user,"modulo.temperatura.gerenciar_cadastros") && <Link href={`${base}/opcoes`} className="btn-secondary">Gerenciar Opções</Link>}
        {fullHistory && <Link href={`${base}/historico/legado`} className="btn-secondary">Registros legados e fechamento mensal</Link>}
        <a className="btn-secondary" href={`/relatorios/controle-temperatura-equipamentos/mensal?mes=${Number(date.slice(5,7))}&ano=${date.slice(0,4)}`} target="_blank" rel="noreferrer">Relatório mensal</a>
      </nav></header>
    <Feedback query={query} />
    {history && <form className="bpma-card flex gap-3" method="get"><label>Data <input className="bpma-input" type="date" name="data" defaultValue={date} max={today} readOnly={!fullHistory} /></label><button className="btn-primary">Consultar</button></form>}
    <section className="bpma-card overflow-x-auto"><table className="w-full text-sm [&_th]:p-3 [&_td]:p-3 [&_th]:text-left [&_tr]:border-b"><thead><tr><th>Equipamento</th><th>Data</th><th>Turno</th><th>Estado</th><th>Ação</th></tr></thead><tbody>
      {expected.map(item => <tr key={item.key}><td>{item.name}</td><td>{today}</td><td>{item.shift}</td><td>PENDENTE</td><td><Link className="btn-secondary" href={`${base}/fluxo?chave=${encodeURIComponent(item.key)}`}>Preencher</Link></td></tr>)}
      {flows.map(unit => { const identity = parseTemperatureKey(unit.chave); return <tr key={unit.id}>
        <td>{unit.temperatura?.equipamento ?? equipment.find(item => item.id === identity.equipmentId)?.nome ?? "Equipamento"}</td>
        <td>{formatAppDateInput(unit.dataReferencia)}</td><td>{identity.shift}</td><td><span className={unit.estado === "REABERTO" ? "rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900" : "font-medium"}>{unit.estado}</span>{unit.estado === "REABERTO" && <p>Aguardando nova assinatura</p>}</td>
        <td><Link className="btn-secondary" href={`${base}/fluxo?chave=${encodeURIComponent(unit.chave)}`}>Abrir</Link></td></tr>; })}
      {!flows.length && !expected.length && <tr><td colSpan={5}>Nenhum registro nesta listagem.</td></tr>}
    </tbody></table></section>
    {history && eligible.length > 0 && canSignModuleDay(user,"temperatura") && <form action={signTemperatureWorkflowAction} className="bpma-card space-y-3">
      <h2 className="font-semibold">Assinatura diária — selecionar aferições</h2><p>Apenas as versões selecionadas serão validadas. Outros equipamentos e turnos permanecem independentes.</p>
      <input type="hidden" name="mecanismo" value="diaria" />
      {eligible.map(unit => <label className="block" key={unit.id}><input type="checkbox" name="unidade" value={`${unit.id}:${unit.versao}`} /> {unit.temperatura?.equipamento} — {parseTemperatureKey(unit.chave).shift} — versão {unit.versao}</label>)}
      <label className="block">Confirme sua senha <input className="bpma-input" type="password" name="senha" required autoComplete="current-password" /></label><button className="btn-primary">Assinar aferições selecionadas</button>
    </form>}
  </div>;
}

export async function TemperatureWorkflowEditor({ query }: { query: WorkflowQuery }) {
  const user = await workflowUser(); const today = formatAppDateInput(getAppDate());
  let key = first(query.chave);
  if (!key && first(query.equipamento) && first(query.data) && first(query.turno)) key = `${first(query.equipamento)}:${first(query.data)}:${first(query.turno)}`;
  if (!key) return redirect(`${base}?new=1`);
  const legacyId=legacyTemperatureId(key);
  if(legacyId)return TemperatureSavedRecordPage({id:legacyId,query});
  let identity: ReturnType<typeof parseTemperatureKey>;
  try { identity = parseTemperatureKey(key); } catch { return <p>Selecione equipamento, data e turno válidos.</p>; }
  const [unit, equipment, closedMonth] = await Promise.all([
    prisma.fluxoOperacional.findUnique({ where: { modulo_chave: { modulo: "temperatura", chave: key } }, include: { temperatura: true, assinaturaVigente: true, versoes: { orderBy: { versao: "desc" }, take: 1 }, eventos: { orderBy: { criadoEm: "desc" }, take: 50 } } }),
    prisma.controleTemperaturaEquipamentoOpcao.findUnique({ where: { id: identity.equipmentId } }),
    isOperationalMonthClosed("temperatura", identity.date.getUTCMonth()+1, identity.date.getUTCFullYear())
  ]);
  if (unit?.temperatura && !unit.excluidoEm) return TemperatureSavedRecordPage({id:unit.temperatura.id,query});
  if (!equipment) return <p>Registro indisponível.</p>;
  if (unit?.excluidoEm) return <p>Registro excluído com auditoria. <Link href={`${base}/fluxo?chave=${encodeURIComponent(key.split(":").slice(0,3).join(":") + ":" + randomUUID())}`}>Criar nova aferição</Link></p>;
  if (!unit) {
    const identityKey = key.split(":").slice(0,3).join(":");
    const active = await prisma.fluxoOperacional.findFirst({ where: { modulo: "temperatura", excluidoEm: null, OR: [{ chave: identityKey }, { chave: { startsWith: identityKey + ":" } }] } });
    if (active) redirect(`${base}/fluxo?chave=${encodeURIComponent(active.chave)}`);
  }
  if (!canReadTemperatureDate(user,identity.date)) return <p>Sem permissão de consulta a esta data.</p>;
  const legacy = !unit && await prisma.controleTemperaturaEquipamento.findFirst({ where: { equipamento: equipment.nome, data: identity.date, turno: identity.shift, fluxoId: null } });
  if (legacy) return <section className="bpma-card">Esta aferição é legada e foi preservada. <Link href={`${base}/historico/legado?dia=${formatAppDateInput(identity.date)}`}>Consultar histórico legado</Link></section>;
  let canEdit = !closedMonth;
  try { assertWorkflowEdit({ user, module: "temperatura", date: identity.date, today: getAppDate(), creating: !unit }); } catch { canEdit = false; }
  const canReopen = !closedMonth && currentTemperatureMonth(identity.date) && hasPermission(user,"modulo.temperatura.reabrir_registro");
  const draft = (unit?.versoes[0]?.rascunho ?? {}) as TemperatureDraft;
  const formalClosed = unit?.estado === "FECHADO";
  const confirm = formalClosed && first(query.confirmar) === "reabrir";
  const fromEdit = first(query.origem) === "editar";
  const url = `${base}/fluxo?chave=${encodeURIComponent(key)}`;
  const hidden = <><input type="hidden" name="chave" value={key} /><input type="hidden" name="id" value={unit?.id ?? ""} /><input type="hidden" name="versao" value={unit?.versao ?? 0} /></>;
  return <div className="space-y-5"><header className="bpma-card"><h1 className="text-xl font-semibold">{equipment.nome} — {formatAppDateInput(identity.date)} — {identity.shift}</h1>
    <p>{unit?.estado === "REABERTO" ? "Revisão pendente — nova assinatura necessária" : unit?.assinaturaVigente ? "Registro assinado" : "Preenchimento salvo"}</p><Link href={`${base}/historico?data=${formatAppDateInput(identity.date)}`}>Histórico</Link></header>
    <Feedback query={query} />
    {closedMonth && <p className="bpma-card">Competência fechada. Disponível somente para consulta.</p>}
    {formalClosed && <section className="bpma-card"><p>Validado por {unit.assinaturaVigente?.usuarioNome}. A assinatura anterior fica preservada no histórico.</p>
      {canReopen && <Link className="btn-secondary" href={`${url}&confirmar=reabrir`}>Reabrir Registro</Link>}{canEdit && canReopen && <Link className="btn-secondary" href={`${url}&confirmar=reabrir&origem=editar`}>Editar</Link>}
    </section>}
    {confirm && canReopen && (!fromEdit || canEdit) && <form action={reopenTemperatureWorkflowAction} className="bpma-card space-y-3" role="dialog" aria-label="Confirmar reabertura">
      {hidden}<input type="hidden" name="confirmar" value="true" /><input type="hidden" name="origem" value={fromEdit ? "editar" : "reabrir"} />
      <p>Este registro já foi validado e fechado pelo supervisor. Ao confirmar, a assinatura anterior deixará de validar a versão atual e será necessária uma nova assinatura.</p>
      <label>Justificativa da reabertura<textarea className="bpma-input" name="justificativa" required maxLength={4000} /></label>
      <Link className="btn-secondary" href={url}>Cancelar</Link><button className="btn-primary">Confirmar reabertura</button>
    </form>}
    <form action={saveTemperatureWorkflowAction} className="bpma-card grid gap-4 md:grid-cols-2">{hidden}
      <fieldset disabled={!canEdit || formalClosed} className="contents">
        <label>Situação<select className="bpma-input" name="statusOperacionalEquipamento" defaultValue={draft.statusOperacionalEquipamento ?? "EM_OPERACAO"}><option value="EM_OPERACAO">Em operação</option><option value="INATIVO">Inativo</option><option value="MANUTENCAO">Em manutenção</option></select></label>
        <label>Temperatura aferida (°C)<input className="bpma-input" name="temperaturaAferida" inputMode="decimal" defaultValue={draft.temperaturaAferida ?? ""} /></label>
        <label>Horário da aferição<input className="bpma-input" type="time" readOnly={formatAppDateInput(identity.date) === today} name="horarioAfericao" defaultValue={draft.horarioAfericao ?? ""} /><span className="text-xs">{formatAppDateInput(identity.date) === today ? "Horário automático na conclusão de hoje." : "Informe o horário real da aferição."}</span></label>
        {formatAppDateInput(identity.date) < today && <label><input type="checkbox" name="horarioNaoInformado" value="true" defaultChecked={draft.horarioNaoInformado === "true"} /> Horário não informado (somente retroativo)<textarea className="bpma-input" name="justificativaHorario" placeholder="Justificativa do horário não informado" defaultValue={draft.justificativaHorario ?? ""} maxLength={1000} /></label>}
        <label className="md:col-span-2">Observação<textarea className="bpma-input" name="observacaoStatusOperacional" defaultValue={draft.observacaoStatusOperacional ?? ""} maxLength={4000} /></label>
        <ImageUploadField name="fotoDesvio" label="Foto da evidência" existingImageDataUrl={draft.fotoBase64 ? `data:${draft.fotoMimeType};base64,${draft.fotoBase64}` : draft.fotoUrl || null} existingFileName={draft.fotoNome || null} maxBytes={1024*1024} compressBeforeUpload inputClassName="bpma-input" />
        <p className="md:col-span-2">A avaliação sanitária e a ação corretiva são calculadas pelas regras do equipamento ao concluir. Inativo e Manutenção dispensam aferição numérica.</p>
        {unit?.temperatura && unit.preenchimentoCompleto && <p className="md:col-span-2">{unit.temperatura.status} — {unit.temperatura.acaoCorretiva ?? "Aferição não aplicável"}</p>}
        <div className="md:col-span-2 flex gap-3"><button className="btn-primary" name="intent" value="draft" formNoValidate>Salvar Registro</button></div>
      </fieldset>
    </form>
    {unit && !closedMonth && unit.preenchimentoCompleto && ["COMPLETO","REABERTO"].includes(unit.estado) && hasPermission(user,"modulo.temperatura.assinar_historico") && <form className="bpma-card space-y-3" action={signTemperatureWorkflowAction}><input type="hidden" name="unidade" value={`${unit.id}:${unit.versao}`} /><input type="hidden" name="mecanismo" value="individual" /><h2>Validação individual do supervisor</h2><label>Confirme sua senha<input className="bpma-input" type="password" name="senha" required /></label><button className="btn-primary">Validar aferição</button></form>}
    {unit?.temperatura && unit.preenchimentoCompleto && !formalClosed && !closedMonth && ["DEV","GERENTE","NUTRICIONISTA"].includes(user.perfil) && hasPermission(user,"modulo.temperatura.excluir_registro") && <details className="bpma-card"><summary>Excluir aferição</summary><form action={deleteTemperatureWorkflowAction}>{hidden}<input type="hidden" name="registroId" value={unit.temperatura.id} /><p>Excluir apenas esta aferição de {equipment.nome}, {formatAppDateInput(identity.date)}, {identity.shift}.</p><textarea className="bpma-input" name="justificativa" required maxLength={4000} placeholder="Justificativa obrigatória" /><button className="btn-secondary">Confirmar exclusão</button></form></details>}
    {unit && <section className="bpma-card"><h2>Histórico da aferição</h2><ol>{unit.eventos.map(event => <li key={event.id}>{event.criadoEm.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} — {event.operacao} — {event.usuarioNome} — versão {event.versaoNova}{event.justificativa ? ` — ${event.justificativa}` : ""}</li>)}</ol></section>}
  </div>;
}
