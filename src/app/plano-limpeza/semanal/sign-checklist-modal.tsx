import { StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { updateWeeklyRecordAction } from "../actions";
import { formatDateDisplay, getStatusLabel, getWeeklyDayLabel } from "../utils";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type WeeklySignChecklistModalProps = {
  closeHref: string;
  returnTo: string;
  execution: {
    executionId: number;
    area: string;
    weekStart: Date;
    weekEnd: Date;
    status: StatusPlanoLimpeza;
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
  };
  items: Array<{
    id: number;
    oQueLimpar: string;
    quando: string;
    quem: string;
    ordem: number;
  }>;
  etapa: "responsavel" | "supervisor";
};

export function WeeklySignChecklistModal({
  closeHref,
  returnTo,
  execution,
  items,
  etapa
}: WeeklySignChecklistModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
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
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura do responsável</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.assinaturaResponsavel || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura do supervisor</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {execution.assinaturaSupervisor || "-"}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status geral</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {getStatusLabel(execution.status)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
            Itens configurados da área ({items.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <tr>
                  <th className="px-3 py-2">Ordem</th>
                  <th className="px-3 py-2">O que limpar</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Quem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      Nenhum item ativo configurado para esta área.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.ordem}</td>
                      <td className="px-3 py-2">{item.oQueLimpar}</td>
                      <td className="px-3 py-2">{getWeeklyDayLabel(item.quando)}</td>
                      <td className="px-3 py-2">{item.quem}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form action={updateWeeklyRecordAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={String(execution.executionId)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="etapa" value={etapa} />

          {etapa === "responsavel" ? (
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Assinatura do Responsável pela Área *
              <input type="text" name="assinaturaResponsavel" required className={INPUT_CLASS} />
            </label>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Responsável pela Área
                </p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {execution.assinaturaResponsavel}
                </p>
              </div>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                Assinatura do Supervisor *
                <input type="text" name="assinaturaSupervisor" required className={INPUT_CLASS} />
              </label>
            </>
          )}

          <div className="btn-group">
            <Link href={closeHref} className="btn-secondary">
              Cancelar
            </Link>
            <button type="submit" className="btn-primary">
              Confirmar Assinatura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
