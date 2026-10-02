"use server";
import { redirect } from "next/navigation";
import { getCurrentUserForAction } from "@/lib/auth-session";
import { validateSignaturePassword } from "@/lib/authz";
import { getOperationalSignatureModule } from "@/lib/module-signatures";
import { canViewMonthlyPeriods, monthlyPeriodsPath } from "@/lib/monthly-period-permissions";
import { closeReopenedOperationalMonth } from "@/lib/monthly-periods";
import { reopenOperationalMonth } from "@/lib/monthly-reopening";
import { rethrowIfRedirectError } from "@/lib/redirect-error";

function text(form: FormData, key: string) { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; }
async function transition(form: FormData, operation: "reopen" | "close") {
  let returnTo = "/";
  try {
    const config = getOperationalSignatureModule(text(form, "moduloCodigo"));
    returnTo = monthlyPeriodsPath(config.codigo);
    const user = await getCurrentUserForAction();
    if (!canViewMonthlyPeriods(user, config.codigo)) throw new Error("Seu perfil não pode acessar o gerenciamento deste módulo.");
    const params = { user, moduleCode: config.codigo, mes: Number(text(form, "mes")), ano: Number(text(form, "ano")) };
    if (text(form, "confirmacao") !== "sim") throw new Error("Confirme a operação antes de continuar.");
    if (operation === "reopen") await reopenOperationalMonth(params);
    else {
      await validateSignaturePassword({ user, password: text(form, "senhaConfirmacao") });
      await closeReopenedOperationalMonth({ ...params, observacao: text(form, "observacao") });
    }
    redirect(`${returnTo}?feedbackType=success&feedback=${encodeURIComponent(operation === "reopen" ? "Período reaberto com sucesso." : "Período fechado novamente com sucesso.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error && !/prisma|p20\d{2}|transaction|stack/i.test(error.message) ? error.message : "Não foi possível concluir a operação. Atualize a página e tente novamente.";
    redirect(`${returnTo}?feedbackType=error&feedback=${encodeURIComponent(message)}`);
  }
}
export async function reopenPeriodAction(form: FormData) { await transition(form, "reopen"); }
export async function closePeriodAction(form: FormData) { await transition(form, "close"); }
