import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { APP_TIME_ZONE } from "@/lib/date-time";
import { hasPermission } from "@/lib/permissions";
import { defaultUnitName, getReportIdentity, getVisualPersonalization } from "@/lib/visual-personalization";
import { removeLogoAction, restoreDefaultsAction, savePersonalizationAction } from "./actions";
import { PersonalizationForm } from "./personalization-form";

export const dynamic = "force-dynamic";

export default async function PersonalizationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "modulo.personalizacao.acessar")) redirect("/acesso-negado");

  const config = await getVisualPersonalization();
  const identity = await getReportIdentity();
  const previewMonth = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE, month: "2-digit", year: "numeric"
  }).format(new Date());

  return <div className="space-y-6">
    <section className="bpma-card">
      <h1 className="text-2xl font-semibold">Personalização Visual</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Configure a identidade visual dos relatórios da unidade.</p>
    </section>
    <PersonalizationForm logoDataUrl={identity.logoDataUrl} fileName={config?.logoNomeArquivo ?? null}
      logoLargura={identity.logoLargura} logoAlturaMaxima={identity.logoAlturaMaxima}
      unitName={config?.nomeUnidade ?? ""} fallbackUnitName={defaultUnitName()} previewMonth={previewMonth}
      saveAction={savePersonalizationAction} removeAction={removeLogoAction} resetAction={restoreDefaultsAction} />
  </div>;
}
