import { formatAppDateTime } from "@/lib/date-time";
import { getCurrentUser } from "@/lib/auth-session";
import { findLegacyMonthlyClosure } from "@/lib/monthly-reopening";
import { ReopenMonthForm } from "./reopen-month-form";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { getRoleLabel, type UserRole } from "@/lib/rbac";

import {
  signModuleDayAction,
  signModuleMonthlyClosureAction
} from "@/app/historico-operacional/actions";

type SignatureInfo = {
  usuarioNomeSnapshot: string;
  usuarioPerfilSnapshot: UserRole;
  assinadoEm: Date;
  observacao?: string | null;
} | null;

export function SupervisorSignatureStatus({
  signature
}: {
  signature: SignatureInfo;
}) {
  if (!signature) {
    return (
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Pendente assinatura
      </span>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        Assinado pelo Supervisor
      </span>
      <p>{signature.usuarioNomeSnapshot}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {getRoleLabel(signature.usuarioPerfilSnapshot)} em {formatAppDateTime(signature.assinadoEm)}
      </p>
    </div>
  );
}

export function SignDayForm({
  moduleCode,
  dateInput,
  returnTo,
  canSign,
  alreadySigned,
  hasOperationalWarnings = false
}: {
  moduleCode: OperationalSignatureModuleCode;
  dateInput: string;
  returnTo: string;
  canSign: boolean;
  alreadySigned: boolean;
  hasOperationalWarnings?: boolean;
}) {
  if (alreadySigned || !canSign) {
    return null;
  }

  return (
    <form action={signModuleDayAction} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <input type="hidden" name="moduloCodigo" value={moduleCode} />
      <input type="hidden" name="dataReferencia" value={dateInput} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Esta assinatura valida a revisão de todos os registros deste dia.
        </p>
        {hasOperationalWarnings ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">
            Existem pendências, alertas ou não conformidades neste dia. A assinatura registra a revisão sem ocultar esses pontos.
          </p>
        ) : null}
      </div>
      <label className="block text-sm text-slate-700 dark:text-slate-200">
        Confirme sua senha *
        <input type="password" name="senhaConfirmacao" required className="bpma-input" />
      </label>
      <label className="block text-sm text-slate-700 dark:text-slate-200">
        Observação da revisão
        <textarea name="observacao" rows={2} className="bpma-input" />
      </label>
      <button type="submit" className="btn-primary">
        Assinar dia
      </button>
    </form>
  );
}

export async function MonthlyClosureSection({
  moduleCode,
  month,
  year,
  returnTo,
  indicators,
  signedClosure,
  canSign,
  pendingDailySignatures
}: {
  moduleCode: OperationalSignatureModuleCode;
  month: number;
  year: number;
  returnTo: string;
  indicators: Record<string, string | number>;
  signedClosure: SignatureInfo;
  canSign: boolean;
  pendingDailySignatures: number;
}) {
  const indicatorEntries = Object.entries(indicators);
  const user = await getCurrentUser();
  const legacy = !signedClosure ? await findLegacyMonthlyClosure(moduleCode, month, year) : null;
  const isClosed = Boolean(signedClosure) || legacy?.status === "ASSINADO";

  return (
    <section id="fechamento-mensal" className="bpma-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Fechamento Mensal
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Consolidação de {String(month).padStart(2, "0")}/{year} para entrega e auditoria sanitária.
          </p>
        </div>
        <SupervisorSignatureStatus signature={signedClosure} />
      </div>

      <p className="mt-3 text-sm font-medium">{isClosed ? "Período fechado" : "Período aberto"}</p>
      {!signedClosure && legacy?.status === "ASSINADO" ? (
        <p className="text-sm">Fechamento assinado por {legacy.responsavelTecnico} em {formatAppDateTime(legacy.dataAssinatura)}.</p>
      ) : null}
      {isClosed && user?.perfil === "DEV" ? (
        <div className="mt-3"><ReopenMonthForm moduleCode={moduleCode} month={month} year={year} returnTo={returnTo} /></div>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {indicatorEntries.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <dt className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {!isClosed && canSign ? (
        <form action={signModuleMonthlyClosureAction} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <input type="hidden" name="moduloCodigo" value={moduleCode} />
          <input type="hidden" name="mes" value={month} />
          <input type="hidden" name="ano" value={year} />
          <input type="hidden" name="returnTo" value={`${returnTo}#fechamento-mensal`} />
          <input type="hidden" name="indicadoresSnapshot" value={JSON.stringify(indicators)} />
          {pendingDailySignatures > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-200">
              Existem {pendingDailySignatures} dia(s) sem assinatura de supervisor neste mês. A assinatura mensal é permitida e preserva essa pendência no resumo.
            </p>
          ) : null}
          <label className="block text-sm text-slate-700 dark:text-slate-200">
            Confirme sua senha *
            <input type="password" name="senhaConfirmacao" required className="bpma-input" />
          </label>
          <label className="block text-sm text-slate-700 dark:text-slate-200">
            Observação do fechamento
            <textarea name="observacao" rows={2} className="bpma-input" />
          </label>
          <button type="submit" className="btn-primary">
            Assinar Fechamento Mensal
          </button>
        </form>
      ) : null}
    </section>
  );
}
