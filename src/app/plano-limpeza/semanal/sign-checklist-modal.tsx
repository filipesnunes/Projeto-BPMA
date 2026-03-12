import { StatusPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { updateWeeklyRecordAction } from "../actions";
import { getStatusLabel, getWeeklyDayLabel, formatDateDisplay } from "../utils";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type WeeklySignChecklistModalProps = {
  closeHref: string;
  returnTo: string;
  record: {
    id: number;
    dataExecucao: Date;
    area: string;
    status: StatusPlanoLimpeza;
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
    item: {
      oQueLimpar: string;
      quando: string;
      quem: string;
    };
  };
  etapa: "responsavel" | "supervisor";
};

export function WeeklySignChecklistModal({
  closeHref,
  returnTo,
  record,
  etapa
}: WeeklySignChecklistModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assinar Checklist Semanal
        </h3>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {formatDateDisplay(record.dataExecucao)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Área</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{record.area}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">O que limpar</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{record.item.oQueLimpar}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Quando limpar</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {getWeeklyDayLabel(record.item.quando)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Quem executa</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{record.item.quem}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura do responsável</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {record.assinaturaResponsavel || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Assinatura do supervisor</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {record.assinaturaSupervisor || "-"}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status atual</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {getStatusLabel(record.status)}
            </p>
          </div>
        </div>

        <form action={updateWeeklyRecordAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={String(record.id)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="etapa" value={etapa} />

          {etapa === "responsavel" ? (
            <label className="text-sm text-slate-700 dark:text-slate-200">
              Assinatura do Responsável pela Limpeza *
              <input type="text" name="assinaturaResponsavel" required className={INPUT_CLASS} />
            </label>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Responsável pela Limpeza
                </p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {record.assinaturaResponsavel}
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
