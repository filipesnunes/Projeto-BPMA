import { APP_NAME } from "@/lib/app-branding";
import { normalizeLogoDimensions } from "@/lib/logo-dimensions";

export type ReportIdentity = { unitName: string; logoDataUrl: string | null; logoLargura?: number; logoAlturaMaxima?: number };

export type ReportHeaderDetails = {
  identity: ReportIdentity;
  title: string;
  reportName: string;
  moduleName: string;
  period?: string;
  periodLabel?: "Mês/Ano" | "Período";
  emittedAt?: string;
  closureStatus?: string;
  fallbackBrand?: string;
  institutionalLogoSrc?: string;
};

export function reportHeaderInfo(details: ReportHeaderDetails) {
  return [
    { label: "Relatório", value: details.reportName },
    { label: "Módulo", value: details.moduleName },
    ...(details.period ? [{ label: details.periodLabel ?? "Mês/Ano", value: details.period }] : []),
    ...(details.emittedAt ? [{ label: "Emissão", value: details.emittedAt }] : []),
    ...(details.closureStatus ? [{ label: "Fechamento mensal", value: details.closureStatus }] : [])
  ];
}

export function renderReportHeader(details: ReportHeaderDetails): string {
  const info = reportHeaderInfo(details).map(item =>
    `<span><strong>${escapeIdentityHtml(item.label)}:</strong> ${escapeIdentityHtml(item.value)}</span>`).join("");
  return `<header class="report-header">
    <div class="report-header-main">
      <div class="report-header-cell report-header-hotel">${renderReportIdentity(details.identity, details.fallbackBrand)}</div>
      <div class="report-header-cell report-header-title"><h1>${escapeIdentityHtml(details.title)}</h1></div>
      <div class="report-header-cell report-header-platform"><img class="report-staysafe-logo" src="${escapeIdentityHtml(details.institutionalLogoSrc ?? "/logo-staysafe.webp")}" alt="StaySafe" /></div>
    </div>
    <div class="report-header-info">${info}</div>
  </header>`;
}

export function escapeIdentityHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderReportIdentity(identity: ReportIdentity, fallbackBrand = APP_NAME): string {
  const safeLogo = identity.logoDataUrl && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(identity.logoDataUrl);
  const size = normalizeLogoDimensions(identity);
  const brand = safeLogo
    ? `<div class="report-logo-box" style="width:${size.logoLargura}px;height:${size.logoAlturaMaxima}px"><img class="report-hotel-logo" src="${identity.logoDataUrl}" alt="Logomarca do hotel" /></div>`
    : `<strong>${escapeIdentityHtml(fallbackBrand)}</strong>`;
  const unitName = escapeIdentityHtml(identity.unitName || "Unidade não informada");
  return `<div class="report-identity">${brand}<span title="${unitName}">${unitName}</span></div>`;
}

export const REPORT_IDENTITY_CSS = `
  .report-identity { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 100%; min-width: 0; }
  .report-identity > span { max-width: 100%; overflow-wrap: anywhere; max-height: 2.6em; line-height: 1.3; overflow: hidden; }
  .report-logo-box { display: flex; align-items: center; justify-content: center; max-width: 100%; flex-shrink: 0; }
  .report-hotel-logo { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; object-position: center; }
  .report-header { width: 100%; min-width: 0; color: #0f172a; background: #fff; color-scheme: light; break-inside: avoid; page-break-inside: avoid; margin-bottom: 10px; }
  .report-header-main { display: grid; grid-template-columns: minmax(0,22fr) minmax(0,56fr) minmax(0,22fr); border: 1px solid #9aa5b4; background: #fff; }
  .report-header-cell { display: flex; align-items: center; justify-content: center; min-width: 0; padding: 8px 6px; text-align: center; }
  .report-header-title { border-left: 1px solid #9aa5b4; border-right: 1px solid #9aa5b4; }
  .report-header-title h1, .report-header-title h2 { margin: 0; padding: 0; width: 100%; font-family: inherit; font-size: 16px; line-height: 1.3; font-weight: 700; overflow-wrap: anywhere; text-align: center; }
  .report-header-hotel .report-identity { width: 100%; }
  .report-header-hotel .report-identity > span { display: block; margin-top: 4px; font-size: 10px; font-weight: 400; }
  .report-staysafe-logo { display: block; width: 140px; height: auto; max-width: 100%; max-height: 80px; object-fit: contain; object-position: center; }
  .report-header-info { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 6px 0 0; font-size: 11px; line-height: 1.4; text-align: left; }
  .report-header-info > span { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
  @media print { .report-header { background: #fff !important; color: #0f172a !important; } }
  @media print {
    .bpma-report-document { --background-card: #fff; --background-section: #fff; --background-muted: #fff; --app-surface: #fff; --app-surface-soft: #fff; --app-surface-muted: #fff; --app-text: #0f172a; --text-default: #0f172a; --text-muted: #526579; --table-head-bg: #f2f2f2; --table-row-bg: #fff; --table-row-alt-bg: #fafafa; background: #fff !important; color: #0f172a !important; }
    .bpma-report-document [class*="text-slate-"] { color: #0f172a !important; }
  }
`;

// Embedded images are independent of session/expiring URLs. Wait for decoding before printing.
export const REPORT_PRINT_SCRIPT = `<script>
  async function printReport() {
    const images = Array.from(document.images);
    await Promise.all(images.map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    window.print();
  }
</script>`;
