import { APP_NAME } from "@/lib/app-branding";
import type { ReportIdentity } from "@/lib/report-identity";
import { normalizeLogoDimensions } from "@/lib/logo-dimensions";
import { reportHeaderInfo, REPORT_IDENTITY_CSS, type ReportHeaderDetails } from "@/lib/report-identity";

export function ReportIdentityMark({ identity }: { identity: ReportIdentity }) {
  const size = normalizeLogoDimensions(identity);
  return <div className="report-identity flex max-w-full flex-col items-center justify-center text-center">
    {identity.logoDataUrl ? (
      <div className="report-logo-box flex max-w-full shrink-0 items-center justify-center" style={{width:size.logoLargura,height:size.logoAlturaMaxima}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={identity.logoDataUrl} alt="Logomarca do hotel" className="report-hotel-logo block h-full w-full max-w-full object-contain object-center" />
      </div>
    ) : <strong>{APP_NAME}</strong>}
    <span className="mt-1 block max-w-full break-words text-xs">{identity.unitName || "Unidade não informada"}</span>
  </div>;
}

export function ReportHeader(details: ReportHeaderDetails) {
  return <header className="report-header">
    <style>{REPORT_IDENTITY_CSS}</style>
    <div className="report-header-main">
      <div className="report-header-cell report-header-hotel"><ReportIdentityMark identity={details.identity} /></div>
      <div className="report-header-cell report-header-title"><h2>{details.title}</h2></div>
      <div className="report-header-cell report-header-platform">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="report-staysafe-logo" src={details.institutionalLogoSrc ?? "/logo-staysafe.webp"} alt="StaySafe" />
      </div>
    </div>
    <div className="report-header-info">{reportHeaderInfo(details).map(item => <span key={item.label}><strong>{item.label}:</strong> {item.value}</span>)}</div>
  </header>;
}
