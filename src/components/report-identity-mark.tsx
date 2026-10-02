import { APP_NAME } from "@/lib/app-branding";
import type { ReportIdentity } from "@/lib/report-identity";

export function ReportIdentityMark({ identity }: { identity: ReportIdentity }) {
  return <div className="flex max-w-full flex-col items-center justify-center text-center">
    {identity.logoDataUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={identity.logoDataUrl} alt="Logomarca do hotel" className="block h-auto max-h-4 w-auto max-w-full object-contain" />
    ) : <strong>{APP_NAME}</strong>}
    <span className="mt-1 block max-w-full break-words text-xs">{identity.unitName || "Unidade não informada"}</span>
  </div>;
}
