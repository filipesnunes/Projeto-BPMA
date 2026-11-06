import { pendingOilReviewDates } from "@/lib/monthly-periods";
import { retroactiveNature, technicalReviewPending, signatureBadgeLabel } from "@/lib/review-presentation";
import { DaySignatureForm } from "./day-signature-form";
import {legacyReviewScope} from "@/lib/legacy-review-scope";
import {parseAppDateInput} from "@/lib/date-time";
import { formatAppDateTime } from "@/lib/date-time";
import { getCurrentUser } from "@/lib/auth-session";
import { findLegacyMonthlyClosure } from "@/lib/monthly-reopening";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canViewMonthlyPeriods, monthlyPeriodsPath } from "@/lib/monthly-period-permissions";
import type { OperationalSignatureModuleCode } from "@/lib/module-signatures";
import { getRoleLabel, type UserRole } from "@/lib/rbac";

import {
  signModuleMonthlyClosureAction
} from "@/app/historico-operacional/actions";

type SignatureInfo = {
  usuarioNomeSnapshot: string;
  usuarioPerfilSnapshot: UserRole | null;
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
        {signatureBadgeLabel(signature.observacao)}
      </span>
      <p>{signature.usuarioNomeSnapshot}</p>
      {retroactiveNature(signature.observacao)?.includes("retroativa") && <p className="text-xs text-slate-500">Assinatura retroativa</p>}
      {technicalReviewPending(signature.observacao) && <p className="text-xs">Revisão registrada; não substitui revisão técnica quando exigida.</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {signature.usuarioPerfilSnapshot ? getRoleLabel(signature.usuarioPerfilSnapshot) : "Perfil não informado"} em {formatAppDateTime(signature.assinadoEm)}
      </p>
    </div>
  );
}

export async function SignDayForm({
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
  if (alreadySigned) return <p role="status" className="mt-4 rounded border border-emerald-500 p-3">A revisão deste dia está assinada. Confira o responsável e o horário no Histórico.</p>;
  if (!canSign || !["hortifruti","limpeza_diaria","limpeza_semanal"].includes(moduleCode)) {
    return null;
  }

  const date=parseAppDateInput(dateInput);if(!date)return null;
  const scope=await legacyReviewScope(prisma,moduleCode,date);
  if(!scope.rows.length)return null;
  return <><p>{hasOperationalWarnings ? "Existem pendências ou alertas no dia; a revisão não os oculta." : ""}</p><DaySignatureForm historyPath={returnTo.split("?")[0]} fields={{escopo:scope.token,moduloCodigo:moduleCode,dataReferencia:dateInput,returnTo}}/></>;

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
  const user = await getCurrentUser();
  const legacy = !signedClosure ? await findLegacyMonthlyClosure(moduleCode, month, year) : null;
  const isClosed = Boolean(signedClosure) || legacy?.status === "ASSINADO";
  const state = await prisma.fechamentoMensalModulo.findUnique({ where: { moduloCodigo_ano_mes: { moduloCodigo: moduleCode, mes: month, ano: year } } });
  const reopened = state?.status === "REABERTO";
  const oilPending = moduleCode === "oleo" ? await pendingOilReviewDates(month,year) : [];
  const indicatorEntries = Object.entries({ ...indicators, ...(moduleCode === "oleo" ? { "Dias com revisão técnica pendente": oilPending.length } : {}) });

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

      <p className="mt-3 text-sm font-medium">{reopened ? "Período reaberto" : isClosed ? "Período fechado" : "Período aberto normalmente"}</p>
      <Link href={`/historico-operacional/revisao-retroativa?modulo=${moduleCode}&data=${year}-${String(month).padStart(2,"0")}-01`} className="btn-secondary">Consultar assinaturas retroativas</Link>
      {oilPending.length > 0 && <p className="mt-3 text-sm">Revisão técnica pendente em: {oilPending.join(", ")}. Uma revisão gerencial ou operacional registrada não substitui essa exigência.</p>}
      {!signedClosure && legacy?.status === "ASSINADO" ? (
        <p className="text-sm">Fechamento assinado por {legacy.responsavelTecnico} em {formatAppDateTime(legacy.dataAssinatura)}.</p>
      ) : null}
      {user && canViewMonthlyPeriods(user, moduleCode) ? (
        <div className="mt-3"><Link href={monthlyPeriodsPath(moduleCode)} className="btn-secondary">Gerenciar Períodos</Link></div>
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

      {!isClosed && !reopened && canSign ? (
        <form action={signModuleMonthlyClosureAction} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <input type="hidden" name="moduloCodigo" value={moduleCode} />
          <input type="hidden" name="mes" value={month} />
          <input type="hidden" name="ano" value={year} />
          <input type="hidden" name="returnTo" value={`${returnTo}#fechamento-mensal`} />
          <input type="hidden" name="indicadoresSnapshot" value={JSON.stringify(indicators)} />
          {pendingDailySignatures > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-200">
              {moduleCode==="amostras"?`Existem ${pendingDailySignatures} dia(s) com pendências de validação técnica. Confira a lista de pendências antes de fechar o mês.`:`Existem ${pendingDailySignatures} dia(s) sem assinatura de supervisor neste mês. A assinatura mensal é permitida e preserva essa pendência no resumo.`}
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
          {oilPending.length>0&&<label className="block"><input type="checkbox" name="confirmarPendencias" value="sim" required/>Confirmo o fechamento com {oilPending.length} dia(s) pendentes: {oilPending.join(", ")}. Informe a justificativa na observação.</label>}
          <button type="submit" className="btn-primary">
            Assinar Fechamento Mensal
          </button>
        </form>
      ) : null}
    </section>
  );
}
