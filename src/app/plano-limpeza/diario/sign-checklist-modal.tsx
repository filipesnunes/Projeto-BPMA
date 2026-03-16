import { StatusPlanoLimpeza, TurnoPlanoLimpeza } from "@prisma/client";
import Link from "next/link";

import { updateDailyRecordAction } from "../actions";
import { getStatusLabel, getTurnoLabel, formatDateDisplay } from "../utils";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type DailySignChecklistModalProps = {
  closeHref: string;
  returnTo: string;
  record: {
    id: number;
    data: Date;
    turno: TurnoPlanoLimpeza;
    area: string;
    status: StatusPlanoLimpeza;
    assinaturaResponsavel: string;
    assinaturaSupervisor: string;
  };
  etapa: "responsavel" | "supervisor";
};

export function DailySignChecklistModal({
  closeHref,
  returnTo,
  record,
  etapa
}: DailySignChecklistModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assinar Checklist Diário
        </h3>

        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Data</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {formatDateDisplay(record.data)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Turno</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {getTurnoLabel(record.turno)}
            </p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Área</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{record.area}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Status Atual</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              {getStatusLabel(record.status)}
            </p>
          </div>
        </div>

        <form action={updateDailyRecordAction} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={String(record.id)} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="etapa" value={etapa} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Assinatura
            </p>
            <p className="font-medium text-slate-800 dark:text-slate-100">
              O usuário logado será registrado automaticamente.
            </p>
          </div>

          {etapa === "responsavel" ? (
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Etapa: Assinatura do Responsável pela Limpeza.
            </p>
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
              <p className="text-sm text-slate-700 dark:text-slate-200">
                Etapa: Assinatura do Supervisor.
              </p>
            </>
          )}
          <label className="text-sm text-slate-700 dark:text-slate-200">
            Confirme sua senha *
            <input type="password" name="senhaConfirmacao" required className={INPUT_CLASS} />
          </label>

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
