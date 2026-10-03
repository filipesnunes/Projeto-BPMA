import { APP_NAME } from "@/lib/app-branding";
import type { ReportIdentity } from "@/lib/report-identity";
import { normalizeLogoDimensions } from "@/lib/logo-dimensions";

export function ReportIdentityMark({ identity }: { identity: ReportIdentity }) {
  const size = normalizeLogoDimensions(identity);
  return <div className="flex max-w-full flex-col items-center justify-center text-center">
    {identity.logoDataUrl ? (
      <div className="flex max-w-full shrink-0 items-center justify-center" style={{width:size.logoLargura,height:size.logoAlturaMaxima}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={identity.logoDataUrl} alt="Logomarca do hotel" className="block h-full w-full max-w-full object-contain object-center" />
      </div>
    ) : <strong>{APP_NAME}</strong>}
    <span className="mt-1 block max-w-full break-words text-xs">{identity.unitName || "Unidade não informada"}</span>
  </div>;
}
