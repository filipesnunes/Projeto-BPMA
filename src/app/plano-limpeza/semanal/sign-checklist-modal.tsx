import { StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { updateWeeklyRecordAction } from "../actions";
import { StatusBadge } from "../status-badge";
import { formatDateDisplay, getWeeklyDayLabel } from "../utils";

type WeeklySignChecklistModalProps = {
  closeHref: string;
  returnTo: string;
  execution: {
    executionId: number;
    area: string;
    weekStart: Date;
    weekEnd: Date;
    status: StatusPlanoLimpeza;
    statusGeral: "Pendente" | "Parcial" | "Aguardando Supervisor" | "Concluído";
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
  };
  items: Array<{
    id: number;
    status: StatusPlanoLimpeza;
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
    etapa: "responsavel" | "supervisor" | null;
    item: {
      id: number;
      ordem: number;
      oQueLimpar: string;
      quando: string;
      quem: string;
    };
  }>;
};

export function WeeklySignChecklistModal({
  closeHref,
  returnTo,
  execution,
  items
}: WeeklySignChecklistModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Execução Semanal da Área
        </h3>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Área</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{execution.area}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Semana</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {formatDateDisplay(execution.weekStart)} até {formatDateDisplay(execution.weekEnd)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Responsável (área)</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.assinaturaResponsavel || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Supervisor (área)</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.assinaturaSupervisor || "-"}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status geral da área</p>
            <div className="mt-1">
              <StatusBadge status={execution.statusGeral} />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
            Itens da Área ({items.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[980px] divide-y divide-slate-200 text-xs dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Ordem</th>
                  <th className="px-3 py-2">O que limpar</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Quem</th>
                  <th className="px-3 py-2">Assinatura do Responsável</th>
                  <th className="px-3 py-2">Assinatura do Supervisor</th>
                  <th className="px-3 py-2">Status do Item</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhum item encontrado para esta execução semanal.
                    </td>
                  </tr>
                ) : (
                  items.map((executionItem) => (
                    <tr key={executionItem.id}>
                      <td className="px-3 py-2">{executionItem.item.ordem}</td>
                      <td className="px-3 py-2">{executionItem.item.oQueLimpar}</td>
                      <td className="px-3 py-2">{getWeeklyDayLabel(executionItem.item.quando)}</td>
                      <td className="px-3 py-2">{executionItem.item.quem}</td>
                      <td className="px-3 py-2">
                        {executionItem.assinaturaResponsavel || "-"}
                      </td>
                      <td className="px-3 py-2">
                        {executionItem.assinaturaSupervisor || "-"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={executionItem.status} />
                      </td>
                      <td className="px-3 py-2">
                        {executionItem.etapa === "responsavel" ? (
                          <form action={updateWeeklyRecordAction} className="flex min-w-[280px] gap-2">
                            <input type="hidden" name="id" value={String(executionItem.id)} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="etapa" value="responsavel" />
                            <input
                              type="password"
                              name="senhaConfirmacao"
                              required
                              placeholder="Confirme sua senha"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button type="submit" className="btn-primary whitespace-nowrap">
                              Assinar
                            </button>
                          </form>
                        ) : executionItem.etapa === "supervisor" ? (
                          <form action={updateWeeklyRecordAction} className="flex min-w-[280px] gap-2">
                            <input type="hidden" name="id" value={String(executionItem.id)} />
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <input type="hidden" name="etapa" value="supervisor" />
                            <input
                              type="password"
                              name="senhaConfirmacao"
                              required
                              placeholder="Confirme sua senha"
                              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button type="submit" className="btn-primary whitespace-nowrap">
                              Assinar
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Item Concluído
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 btn-group">
          <Link href={closeHref} className="btn-secondary">
            Fechar
          </Link>
        </div>
      </div>
    </div>
  );
}
