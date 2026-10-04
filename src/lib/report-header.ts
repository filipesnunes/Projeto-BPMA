import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderReportHeader as renderHeader, type ReportHeaderDetails } from "@/lib/report-identity";

let institutionalLogo: string | undefined;

export function getInstitutionalReportLogo(): string {
  // Embed the original static asset: standalone reports/PDFs have no URL dependency.
  institutionalLogo ??= `data:image/webp;base64,${readFileSync(join(process.cwd(), "public", "logo-staysafe.webp")).toString("base64")}`;
  return institutionalLogo;
}

export function renderReportHeader(details: ReportHeaderDetails): string {
  return renderHeader({ ...details, institutionalLogoSrc: getInstitutionalReportLogo() });
}
