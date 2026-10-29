import { fullTemperatureHistory, MONTH_EDIT } from "../correction-policy";
import { loadTemperatureHistory, positivePage } from "./history-data";
import { TemperatureHistoryWorkflows } from "./history-workflows";
import { CompatibleDayReview } from "@/components/compatible-day-review";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { parseFilterMonth, parseFilterYear } from "@/lib/month-filter";
import {
  StatusTemperaturaEquipamento
} from "@prisma/client";
import Link from "next/link";

import { MonthlyClosureSection, SupervisorSignatureStatus } from "@/components/historico/technical-signature";
import { ActionModal } from "@/components/ui/action-modal";
import { getCurrentUser } from "@/lib/auth-session";
import { formatAppDate, formatAppDateInput, getAppDate } from "@/lib/date-time";
import { getImageDataUrl } from "@/lib/image-upload";
import { canSignModuleDay, canSignModuleMonthlyClosure } from "@/lib/module-signatures";

import { EvidencePhoto } from "../evidence-photo";
import { TemperatureStatusBadge } from "../temperature-status-badge";
import {
  formatDateDisplay,
  formatTemperatureDisplay,
  getOperationalStatusLabel,
  getShiftLabel,
  isOperationalTemperatureStatus,
  parsePositiveInt
} from "../utils";

const PAGE_PATH = "/controle-temperatura-equipamentos/historico";
const CARD_CLASS = "bpma-card";
const INPUT_CLASS = "bpma-input";
const MODULE_CODE = "temperatura";

const MONTH_OPTIONS = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" }
];

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPathWithParams(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function parseStatusFilter(value: string): StatusTemperaturaEquipamento | null {
  if (value === StatusTemperaturaEquipamento.CONFORME) {
    return StatusTemperaturaEquipamento.CONFORME;
  }
  if (value === StatusTemperaturaEquipamento.ALERTA) {
    return StatusTemperaturaEquipamento.ALERTA;
  }
  if (value === StatusTemperaturaEquipamento.CRITICO) {
    return StatusTemperaturaEquipamento.CRITICO;
  }
  return null;
}


export default async function ControleTemperaturaHistoricoPage({
  searchParams
}: PageProps) {
  const authUser = await getCurrentUser();
  if (!authUser) redirect("/login");
  const fullHistory=fullTemperatureHistory(authUser);
  if (!hasPermission(authUser,"modulo.temperatura.acessar") || !fullHistory && !hasPermission(authUser,MONTH_EDIT) && !hasPermission(authUser,"modulo.temperatura.reabrir_registro")) redirect("/acesso-negado");
  const today=getAppDate();
  const canSignDay = authUser ? canSignModuleDay(authUser, MODULE_CODE) : false;
  const canSignMonthly = authUser ? canSignModuleMonthlyClosure(authUser, MODULE_CODE) : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";
  const filtroData = firstParam(params.filtroData).trim();
  const filtroMes = parseFilterMonth(firstParam(params.filtroMes));
  const filtroAno = parseFilterYear(firstParam(params.filtroAno));
  const filtroEquipamento = firstParam(params.filtroEquipamento).trim();
  const filtroStatus = parseStatusFilter(firstParam(params.filtroStatus).trim());
  const filtroResponsavel = firstParam(params.filtroResponsavel).trim();
  const diaAberto = firstParam(params.dia).trim();
  const fotoId = parsePositiveInt(firstParam(params.fotoId));

  const data=await loadTemperatureHistory({filters:{date:filtroData,month:filtroMes,year:filtroAno,equipment:filtroEquipamento,status:filtroStatus,responsible:filtroResponsavel},today,fullHistory,page:positivePage(firstParam(params.pagina)),detailPage:positivePage(firstParam(params.detalhePagina)),openDay:diaAberto,photoId:fotoId});
  const {groups:grupos,selected:grupoSelecionado,signatures:assinaturasPorData,closure:fechamentoMensal,indicators:indicadoresMensais,month:selectedMonth,year:selectedYear,photo:registroFotoSelecionado}=data;
  const parametrosRetorno=new URLSearchParams();
  for(const key of ["filtroData","filtroMes","filtroAno","filtroEquipamento","filtroStatus","filtroResponsavel"] as const){const value=firstParam(params[key]);if(value)parametrosRetorno.set(key,value);}
  if(data.page>1)parametrosRetorno.set("pagina",String(data.page));
  const returnTo=buildPathWithParams(parametrosRetorno);
  const buildOpenDayHref=(date:string)=>{const query=new URLSearchParams(parametrosRetorno);query.set("dia",date);return buildPathWithParams(query);};
  const pageHref=(page:number)=>{const query=new URLSearchParams(parametrosRetorno);query.set("pagina",String(page));return buildPathWithParams(query);};
  const detailHref=(page:number)=>{const query=new URLSearchParams(parametrosRetorno);query.set("dia",diaAberto);query.set("detalhePagina",String(page));return buildPathWithParams(query);};
  const buildOpenPhotoHref=(id:number)=>{const query=new URLSearchParams(parametrosRetorno);query.set("dia",diaAberto);query.set("fotoId",String(id));if(data.detailPage>1)query.set("detalhePagina",String(data.detailPage));return buildPathWithParams(query);};
  const closePhotoHref=grupoSelecionado?detailHref(data.detailPage):returnTo;
  const fotoSelecionadaFallbackSrc=registroFotoSelecionado?getImageDataUrl(registroFotoSelecionado.fotoMimeType,registroFotoSelecionado.fotoBase64):null;
  const fotoSelecionadaPrimarySrc=registroFotoSelecionado?.fotoUrl?.trim()||fotoSelecionadaFallbackSrc;
  const implicitPeriod=!filtroData&&!filtroMes&&!filtroAno;

  return (
    <div className="space-y-6 dark:text-slate-100">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Histórico Completo
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Consulta por dia, revisão do supervisor e fechamento mensal de temperatura.
            </p>
          </div>
          <div className="btn-group">
            <Link href="/controle-temperatura-equipamentos" className="btn-secondary">
              Voltar ao Módulo
            </Link>
          </div>
        </div>
      </section>

      {feedback ? (
        <section
          className={`rounded-xl border p-4 text-sm ${
            feedbackType === "error"
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {feedback}
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Filtros</h2>
        <form method="get" className="grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-6 dark:bg-slate-800">
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Data
            <input type="date" name="filtroData" defaultValue={filtroData} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Mês
            <select name="filtroMes" defaultValue={filtroMes ? String(filtroMes) : implicitPeriod?String(selectedMonth):""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={String(month.value)}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Ano
            <input type="number" name="filtroAno" min={2020} max={2100} defaultValue={filtroAno ?? (!filtroData?selectedYear:"")} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Equipamento
            <input type="text" name="filtroEquipamento" defaultValue={filtroEquipamento} className={INPUT_CLASS} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Status
            <select name="filtroStatus" defaultValue={filtroStatus ?? ""} className={INPUT_CLASS}>
              <option value="">Todos</option>
              <option value={StatusTemperaturaEquipamento.CONFORME}>Normal</option>
              <option value={StatusTemperaturaEquipamento.ALERTA}>Alerta</option>
              <option value={StatusTemperaturaEquipamento.CRITICO}>Crítico</option>
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Responsável
            <input type="text" name="filtroResponsavel" defaultValue={filtroResponsavel} className={INPUT_CLASS} />
          </label>
          <div className="btn-group md:col-span-6">
            <button type="submit" className="btn-primary">Aplicar Filtros</button>
            <Link href={PAGE_PATH} className="btn-secondary">Limpar</Link>
          </div>
        </form>
      </section>

      <section className={CARD_CLASS}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Dias no Histórico ({data.totalDays})
        </h2>
        <p className="mb-3 text-sm">{data.totalRecords} registros encontrados. Página {data.page} de {data.pages}.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Registros</th>
                <th className="px-3 py-2">Status operacional</th>
                <th className="px-3 py-2">Alertas</th>
                <th className="px-3 py-2">Assinatura</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {grupos.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={6}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                grupos.map((grupo) => {
                  const key = formatAppDateInput(grupo.data);
                  const alertas = grupo.alertas;
                  const registrosInativos = grupo.inativos;
                  const assinatura = assinaturasPorData.get(key) ?? null;

                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">{formatDateDisplay(grupo.data)}</td>
                      <td className="px-3 py-2">{grupo.quantidade}</td>
                      <td className="px-3 py-2">
                        {alertas > 0 ? "Com alerta" : registrosInativos > 0 ? "Com equipamento fora de operação" : "Completo"}
                      </td>
                      <td className="px-3 py-2">{alertas}</td>
                      <td className="px-3 py-2"><SupervisorSignatureStatus signature={assinatura} /></td>
                      <td className="px-3 py-2">
                        <Link prefetch={false} href={buildOpenDayHref(key)} scroll={false} className="btn-action">
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.pages>1&&<nav className="btn-group" aria-label="Páginas dos dias">{data.page>1&&<Link prefetch={false} className="btn-secondary" href={pageHref(data.page-1)}>Página anterior</Link>}{data.page<data.pages&&<Link prefetch={false} className="btn-secondary" href={pageHref(data.page+1)}>Próxima página</Link>}</nav>}
      <MonthlyClosureSection
        moduleCode={MODULE_CODE}
        month={selectedMonth}
        year={selectedYear}
        returnTo={returnTo}
        indicators={indicadoresMensais}
        signedClosure={fechamentoMensal}
        canSign={canSignMonthly}
        pendingDailySignatures={indicadoresMensais["Dias pendentes de assinatura"]}
      />

      {grupoSelecionado ? (
        <ActionModal
          title={`Registros de ${formatAppDate(grupoSelecionado.data)}`}
          cancelHref={returnTo}
          maxWidthClassName="max-w-6xl"
          description={<p>Esta assinatura valida a revisão de todos os registros deste dia.</p>}
        >
          <div className="mb-4">
            <p className="mb-2">{data.detailTotal} aferições. Página {data.detailPage} de {data.detailPages}.</p>
            <SupervisorSignatureStatus
              signature={assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)) ?? null}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Equipamento</th>
                  <th className="px-3 py-2">Turno</th>
                  <th className="px-3 py-2">Operação</th>
                  <th className="px-3 py-2">Temperatura</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ação corretiva</th>
                  <th className="px-3 py-2">Foto</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Observações</th>
                  <th className="px-3 py-2">Registro e correções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {grupoSelecionado.registros.map((registro) => {
                  const registroEmOperacao = isOperationalTemperatureStatus(
                    registro.statusOperacionalEquipamento
                  );
                  const observacaoRegistro = registroEmOperacao
                    ? registro.observacoes
                    : registro.observacaoStatusOperacional;
                  const hasStoredImage = data.photoIds.has(registro.id);

                  return (
                    <tr key={registro.id}>
                      <td className="px-3 py-2">{registro.equipamento}<ProcedureTimeAudit record={registro} temperature={registroEmOperacao} /></td>
                      <td className="px-3 py-2">{getShiftLabel(registro.turno)}</td>
                      <td className="px-3 py-2">{getOperationalStatusLabel(registro.statusOperacionalEquipamento)}</td>
                      <td className="px-3 py-2">{formatTemperatureDisplay(registro.temperaturaAferida)}</td>
                      <td className="px-3 py-2">
                        {registroEmOperacao ? (
                          <TemperatureStatusBadge status={registro.status} />
                        ) : (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            Não aplicável
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{registroEmOperacao ? registro.acaoCorretiva ?? "-" : "-"}</td>
                      <td className="px-3 py-2">
                        {hasStoredImage ? (
                          <Link
                            prefetch={false} href={buildOpenPhotoHref(registro.id)}
                            scroll={false}
                            className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline dark:text-slate-200"
                          >
                            Ver foto
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">{registro.responsavel}</td>
                      <td className="px-3 py-2 max-w-80 whitespace-normal break-words">{observacaoRegistro?.trim() || "-"}</td>
                      <td className="px-3 py-2"><Link prefetch={false} className="btn-secondary" href={`/controle-temperatura-equipamentos/registro/${registro.id}`}>Consultar / Editar</Link>{registro.assinaturaNutricionistaNome&&<p>Assinado por {registro.assinaturaNutricionistaNome}</p>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.detailPages>1&&<nav className="btn-group" aria-label="Páginas das aferições">{data.detailPage>1&&<Link prefetch={false} className="btn-secondary" href={detailHref(data.detailPage-1)}>Aferições anteriores</Link>}{data.detailPage<data.detailPages&&<Link prefetch={false} className="btn-secondary" href={detailHref(data.detailPage+1)}>Mais aferições</Link>}</nav>}
          <CompatibleDayReview
            temperatureSummaryOnly
            moduleCode={MODULE_CODE}
            dateInput={formatAppDateInput(grupoSelecionado.data)}
            returnTo={buildOpenDayHref(formatAppDateInput(grupoSelecionado.data))}
            canSign={canSignDay}
            alreadySigned={Boolean(assinaturasPorData.get(formatAppDateInput(grupoSelecionado.data)))}
            hasOperationalWarnings={data.selectedAlerts>0}
          />
        </ActionModal>
      ) : null}

      {fotoId ? (
        <ActionModal
          title="Foto da evidência"
          cancelHref={closePhotoHref}
          maxWidthClassName="max-w-4xl"
          description={
            registroFotoSelecionado ? (
              <p>
                {registroFotoSelecionado.equipamento} em{" "}
                {formatDateDisplay(registroFotoSelecionado.data)}.
              </p>
            ) : null
          }
        >
          {fotoSelecionadaPrimarySrc ? (
            <EvidencePhoto
              primarySrc={fotoSelecionadaPrimarySrc}
              fallbackSrc={fotoSelecionadaFallbackSrc}
              alt={`Foto do registro ${registroFotoSelecionado?.id ?? fotoId}`}
              className="max-h-[75vh] w-full rounded-lg border border-slate-200 object-contain dark:border-slate-700"
            />
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Foto indisponível.
            </p>
          )}
        </ActionModal>
      ) : null}

      <TemperatureHistoryWorkflows where={data.where} query={params} />
    </div>
  );
}
import { ProcedureTimeAudit } from "@/components/procedure-time-audit";
