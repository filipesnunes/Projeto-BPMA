import { isNonTechnicalRetroactive, retroactiveNature } from "@/lib/review-presentation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { getOperationalSignatureModule } from "@/lib/module-signatures";
import { getAppDate, parseAppDateInput, formatAppDateInput, formatAppDateTime } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { legacyReviewScope } from "@/lib/legacy-review-scope";
import { retroactiveReviewScope } from "@/lib/retroactive-review";
import { retroactiveReviewNature } from "@/lib/retroactive-review-permissions";
import { RetroactiveForm } from "./form";
import { ReviewData, ReviewAudit } from "@/components/historico/review-data";

export const dynamic = "force-dynamic";
export default async function RetroactivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const config = getOperationalSignatureModule(text("modulo"));
  if (!hasPermission(user, `${config.permissionPrefix}.acessar`)) redirect("/acesso-negado");
  const date = parseAppDateInput(text("data")) ?? new Date(+getAppDate() - 86400000);
  const day = formatAppDateInput(date), flowId = text("fluxo"), rawIds = text("registros"), legacyId = text("legado") ? Number(text("legado")) : undefined;
  const base = `/historico-operacional/revisao-retroativa?modulo=${config.codigo}&data=${day}`;
  const isFlow = ["oleo", "temperatura", "amostras", "rastreabilidade"].includes(config.codigo);
  const choices = isFlow ? await prisma.fluxoOperacional.findMany({ where: { modulo: config.codigo, dataReferencia: date, excluidoEm: null }, include: { assinaturaVigente: true }, orderBy: { chave: "asc" } }) : [];
  const legacy = config.codigo==="oleo" ? await prisma.controleQualidadeOleoRegistro.findMany({where:{data:date,fluxoId:null,excluidoEm:null}}) : config.codigo==="temperatura" ? await prisma.controleTemperaturaEquipamento.findMany({where:{data:date,fluxoId:null,excluidoEm:null}}) : [];
  if (legacyId && !legacy.some(row=>row.id===legacyId) && ["oleo","temperatura"].includes(config.codigo)) {
    const linked=config.codigo==="oleo"?await prisma.controleQualidadeOleoRegistro.findUnique({where:{id:legacyId},select:{fluxoId:true,data:true}}):await prisma.controleTemperaturaEquipamento.findUnique({where:{id:legacyId},select:{fluxoId:true,data:true}});
    if(linked?.fluxoId && +linked.data===+date) redirect(`${base}&fluxo=${linked.fluxoId}`);
  }
  const currentSignature=choices.find(unit=>unit.id===flowId)?.assinaturaVigente;
  const pending = !isFlow && config.codigo !== "hortifruti" ? (await legacyReviewScope(prisma, config.codigo, date)).rows.filter(row => "assinaturaSupervisor" in row && (!row.assinaturaSupervisor.trim() || Boolean(retroactiveNature(row.observacaoSupervisor) && retroactiveNature(row.observacaoSupervisor) !== "Revisão técnica retroativa" && retroactiveReviewNature(user) === "Revisão técnica retroativa"))) : [];
  const ids = rawIds ? rawIds.split(",").map(Number) : undefined;
  const selected = isFlow ? Boolean(flowId || legacyId) : config.codigo === "hortifruti" || Boolean(ids?.length);
  const review = selected ? await retroactiveReviewScope(prisma, user, { module: config.codigo, date, flowId: flowId || undefined, recordIds: ids, legacyRecordId:legacyId }) : null;
  const completedRows=Boolean(review?.rows.length) && review!.rows.every(row=>"assinaturaSupervisor" in row && row.assinaturaSupervisor.trim());
  const logs = await prisma.logAssinatura.findMany({ where: { modulo: config.codigo, referenciaId: day }, orderBy: { assinadoEm: "desc" }, take: 30 });
  return <main className="space-y-5">
    <header className="bpma-card space-y-3"><h1 className="text-xl font-semibold">Revisão retroativa — {config.nome}</h1><Link className="btn-secondary" href={config.historyPath}>Voltar ao Histórico</Link>
      <form className="flex flex-wrap gap-3"><input type="hidden" name="modulo" value={config.codigo}/><label>Data operacional<input className="bpma-input" type="date" name="data" defaultValue={day} max={formatAppDateInput(new Date(+getAppDate()-86400000))}/></label><button className="btn-secondary">Consultar</button></form>
      <p>A revisão registra a análise realizada agora. Não altera a autoria nem os procedimentos históricos.</p>
    </header>
    {!selected && <section className="bpma-card space-y-3"><h2 className="font-semibold">Selecionar registros</h2>
      {choices.map(unit => <div key={unit.id} className="border-b py-3"><p>{unit.chave} — {unit.assinaturaVigente ? `Revisado por ${unit.assinaturaVigente.usuarioNome} em ${formatAppDateTime(unit.assinaturaVigente.assinadoEm)} (${unit.assinaturaVigente.mecanismo})` : unit.preenchimentoCompleto ? "Preenchimento completo" : "Preenchimento pendente"}</p>{(!unit.assinaturaVigente || isNonTechnicalRetroactive(unit.assinaturaVigente.mecanismo) && retroactiveReviewNature(user) === "Revisão técnica retroativa") && <Link href={`${base}&fluxo=${unit.id}`} className="btn-secondary">Conferir revisão</Link>}</div>)}
      {pending.length > 0 && <><Link className="btn-secondary" href={`${base}&registros=${pending.map(r=>r.id).join(",")}`}>Conferir todas as pendências do dia ({pending.length})</Link>{pending.map(row => <p key={row.id}>Registro #{row.id} — <Link href={`${base}&registros=${row.id}`}>Conferir individualmente</Link></p>)}</>}
      {legacy.map(row=><p key={row.id}>Registro legado #{row.id} — <Link className="btn-secondary" href={`${base}&legado=${row.id}`}>Conferir revisão</Link></p>)}
      {!choices.length && !pending.length && !legacy.length && <p>Nenhum registro pendente encontrado para esta data.</p>}
    </section>}
    {review && <section className="bpma-card space-y-4"><h2 className="font-semibold">{retroactiveReviewNature(user)} — {user.nomeCompleto}</h2>
      <ul className="list-disc pl-5">{review.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
      <details open><summary>Dados preservados nesta revisão</summary><div className="max-h-96 overflow-auto"><ReviewData value={review.records}/></div></details>
      {currentSignature && !review.allowed?<p role="status">Revisão registrada por {currentSignature.usuarioNome} em {formatAppDateTime(currentSignature.assinadoEm)}. {currentSignature.mecanismo}.</p>:completedRows && !review.allowed?<p role="status">Revisão registrada para as atividades selecionadas. Os responsáveis e horários estão apresentados abaixo na trilha de revisões.</p>:review.allowed ? <RetroactiveForm nomenclature={review.nomenclature} historyPath={config.historyPath} fields={{ modulo: config.codigo, data: day, fluxo: flowId, registros: rawIds, legado:legacyId?String(legacyId):"", escopo: review.token }}/> : <p role="alert">{review.reason}</p>}
    </section>}
    <section className="bpma-card"><h2 className="font-semibold">Revisões registradas</h2>{logs.filter(log=>log.observacao?.includes('"REVISAO_RETROATIVA"')).map(log=><div key={log.id}>{log.nomeCompleto} — {formatAppDateTime(log.assinadoEm)}<ReviewAudit value={log.observacao}/></div>)}</section>
  </main>;
}
