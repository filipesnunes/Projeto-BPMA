import { APP_NAME } from "@/lib/app-branding";

export type ReportIdentity = { unitName: string; logoDataUrl: string | null };

export function escapeIdentityHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderReportIdentity(identity: ReportIdentity, fallbackBrand = APP_NAME): string {
  const safeLogo = identity.logoDataUrl && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(identity.logoDataUrl);
  const brand = safeLogo
    ? `<div class="report-logo-box"><img class="report-hotel-logo" src="${identity.logoDataUrl}" alt="Logomarca do hotel" /></div>`
    : `<strong>${escapeIdentityHtml(fallbackBrand)}</strong>`;
  const unitName = escapeIdentityHtml(identity.unitName || "Unidade não informada");
  return `<div class="report-identity">${brand}<span title="${unitName}">${unitName}</span></div>`;
}

export const REPORT_IDENTITY_CSS = `
  .report-identity { display: flex; flex-direction: column; align-items: center; justify-content: center; max-width: 100%; min-width: 0; }
  .report-identity > span { max-width: 100%; overflow-wrap: anywhere; max-height: 2.6em; line-height: 1.3; overflow: hidden; }
  .report-logo-box { display: flex; align-items: center; justify-content: center; height: 16px; width: 100%; }
  .report-hotel-logo { display: block; width: auto; height: auto; max-width: 100%; max-height: 100%; object-fit: contain; }
`;

// Embedded images are independent of session/expiring URLs. Wait for decoding before printing.
export const REPORT_PRINT_SCRIPT = `<script>
  async function printReport() {
    const images = Array.from(document.images);
    await Promise.all(images.map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    window.print();
  }
</script>`;
