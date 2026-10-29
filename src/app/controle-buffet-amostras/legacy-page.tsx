import { redirect } from "next/navigation";
import { CompatibleWorkflowRecords } from "@/components/compatible-workflow-records";
import { OperationalDeletionPanel } from "@/components/operational-deletion-panel";
import { isOperationalMonthClosed } from "@/lib/monthly-reopening";
import { ModuloDocumento,  StatusItemBuffetAmostra } from "@prisma/client";
import Link from "next/link";

import { DocumentosModuleHeader } from "@/components/documentos/documentos-module-header";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { SporadicServiceModal } from "./sporadic-service-modal";
import { ServiceStatusBadge } from "./status-badges";
import {
  calcularStatusServico,
  formatDateDisplay,
  formatDateInput,
  getServicoPeriodoLabel,
  getTipoServicoLabel,
  getMonthYear,
  getTodaySystemDate,
  isServicoDisponivelNaData
} from "./utils";

const MODULE_PATH = "/controle-buffet-amostras";
const CARD_CLASS =
  "bpma-card";

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ControleBuffetAmostrasPage({ searchParams }: PageProps) {
  const authUser = await getCurrentUser();
  if (!authUser) redirect("/login");
  if (!hasPermission(authUser,"modulo.amostras.acessar")) redirect("/acesso-negado");
  const podeGerenciarOpcoes = authUser
    ? hasPermission(authUser, "modulo.amostras.gerenciar_cadastros")
    : false;
  const podeVerGestao = authUser
    ? hasPermission(authUser, "modulo.amostras.acessar_historico") || podeGerenciarOpcoes
    : false;

  const params = await searchParams;
  const feedback = firstParam(params.feedback).trim();
  const feedbackType = firstParam(params.feedbackType) === "error" ? "error" : "success";

  const today = getTodaySystemDate();
  const currentPeriod = getMonthYear(today);
  const todayInput = formatDateInput(today);

  const [servicos, registrosDia, fechamentoDiaAtual] = await Promise.all([
    prisma.controleBuffetAmostraServico.findMany({
      where: { ativo: true },
      include: {
        itens: {
          where: {
            item: { ativo: true }
          },
          include: {
            item: {
              select: { id: true }
            }
          }
        }
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }]
    }),
    prisma.controleBuffetAmostraRegistro.findMany({
      where: { data: today },
      select: {
        id: true,
        servicoId: true,
        itemId: true,
        itemExtra: true,
        status: true
      }
    }),
    isOperationalMonthClosed("amostras", currentPeriod.mes, currentPeriod.ano)
  ]);

  // Draft item projections stay outside measurement queries, but the familiar
  // service card must still reflect an already initiated service.
  const serviceFlows = await prisma.fluxoOperacional.findMany({where:{modulo:"amostras",dataReferencia:today,excluidoEm:null},include:{versoes:{orderBy:{versao:"desc"},take:1,select:{obrigatorios:true}}}});
  const flowsByService = new Map(serviceFlows.map(flow=>[Number(flow.chave.split(":")[0]),flow]));

  const registrosPorServico = new Map<number, typeof registrosDia>();
  for (const registro of registrosDia) {
    const current = registrosPorServico.get(registro.servicoId) ?? [];
    current.push(registro);
    registrosPorServico.set(registro.servicoId, current);
  }

  const servicosDoDia = servicos.filter((servico) =>
    isServicoDisponivelNaData(servico, today)
  ).map((servico) => {
    const flow = flowsByService.get(servico.id);
    const registrosServico = registrosPorServico.get(servico.id) ?? [];
    const itensAtivos = servico.itens.map((vinculo) => vinculo.item.id);
    const registrosItensAtivos = registrosServico.filter(
      (registro) =>
        registro.itemExtra ||
        (registro.itemId !== null && itensAtivos.includes(registro.itemId))
    );
    const quantidadeItens = flow?.versoes[0]?.obrigatorios ??
      (itensAtivos.length + registrosServico.filter((registro) => registro.itemExtra).length);

    const itensAssinados = registrosItensAtivos.filter(
      (registro) => registro.status === StatusItemBuffetAmostra.ASSINADO
    ).length;
    const itensNaoServidos = registrosItensAtivos.filter(
      (registro) => registro.status === StatusItemBuffetAmostra.NAO_SERVIDO
    ).length;
    const itensIniciados = registrosItensAtivos.filter(
      (registro) => registro.status !== StatusItemBuffetAmostra.PENDENTE
    ).length;

    const status = flow ? (flow.preenchimentoCompleto ? "CONCLUIDO" : "PARCIAL") : calcularStatusServico({
      totalItens: quantidadeItens,
      itensAssinados,
      itensNaoServidos,
      itensIniciados
    });

    return {
      id: servico.id,
      nome: servico.nome,
      observacao: servico.observacao,
      tipoServico: servico.tipoServico,
      periodo: getServicoPeriodoLabel(servico),
      quantidadeItens,
      status
    };
  });

  const fechamentoDiaAssinado = fechamentoDiaAtual;
  return (
    <div className="space-y-6 dark:text-slate-100">
      <DocumentosModuleHeader
        title="Controle de Buffet / Amostras"
        description="Controle diário de temperatura e amostras dos serviços"
        modulo={ModuloDocumento.CONTROLE_BUFFET_AMOSTRAS}
        modulePath={MODULE_PATH}
        searchParams={params}
        managementHref={podeGerenciarOpcoes ? `${MODULE_PATH}/opcoes` : undefined}
        maintenanceHref="/chamados-manutencao?origem=BUFFET_AMOSTRAS"
        actions={
          <>
            {podeVerGestao ? (
              <Link href={`${MODULE_PATH}/historico`} className="btn-secondary">
                Histórico
              </Link>
            ) : null}
          </>
        }
      />

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Serviços do Dia ({formatDateDisplay(today)})
          </h2>
          <SporadicServiceModal
            todayInput={todayInput}
            disabled={fechamentoDiaAssinado}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Serviço</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Itens Configurados</th>
                <th className="px-3 py-2">Status Geral</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {servicosDoDia.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={6}>
                    Nenhum serviço previsto para hoje.
                  </td>
                </tr>
              ) : (
                servicosDoDia.map((servico) => (
                  <tr key={servico.id}>
                    <td className="px-3 py-2">{formatDateDisplay(today)}</td>
                    <td className="px-3 py-2">
                      {servico.nome}
                      {servico.observacao ? (
                        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                          {servico.observacao}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {getTipoServicoLabel(servico.tipoServico)}
                      {servico.tipoServico === "ESPORADICO" ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {servico.periodo}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{servico.quantidadeItens}</td>
                    <td className="px-3 py-2">
                      <ServiceStatusBadge status={servico.status} />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`${MODULE_PATH}/servico/${servico.id}?data=${todayInput}`}
                        className="btn-action"
                      >
                        Abrir Serviço
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <OperationalDeletionPanel target="amostras" selectedDate={params.exclusaoData} />

      <CompatibleWorkflowRecords module="amostras" history={false} query={params} />
    </div>
  );
}
