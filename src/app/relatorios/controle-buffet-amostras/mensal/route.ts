import { NextResponse, type NextRequest } from "next/server";

import {
  StatusFechamentoBuffetAmostra,
  StatusItemBuffetAmostra
} from "@prisma/client";

import { APP_NAME } from "@/lib/app-branding";
import { getCurrentUser } from "@/lib/auth-session";
import {
  formatAppDate,
  formatAppDateInput,
  formatAppDateTime,
  getAppDate,
  getAppMonthDateRange,
  getAppMonthYear,
  getAppNow
} from "@/lib/date-time";
import { OPERATIONAL_SIGNATURE_MODULES } from "@/lib/module-signatures";
import { prisma } from "@/lib/prisma";
import { canAccessReports } from "@/lib/rbac";
import { THERMAL_BOTTLE_EQUIPMENT_LABEL } from "@/app/controle-buffet-amostras/utils";

export const dynamic = "force-dynamic";

const MODULE_CODE = OPERATIONAL_SIGNATURE_MODULES.amostras.codigo;
const MODULE_NAME = "Controle de Buffet / Amostras";
const REPORT_TITLE = "CONTROLE DE AMOSTRAS E TEMPERATURA DO BUFFET";
const REPORT_NAME = "Relatório mensal - controle de buffet / amostras";

type BuffetReportRow = {
  produto: string;
  temperaturaEquipamento: string;
  temperaturaProduto: string;
  acaoCorretiva: string;
  responsavel: string;
  supervisor: string;
};

type BuffetServiceTable = {
  key: string;
  title: string;
  rows: BuffetReportRow[];
};

type MonthlyBuffetReport = {
  monthYearLabel: string;
  unitName: string;
  emittedAt: string;
  services: BuffetServiceTable[];
  closureResponsible: string;
  closureDate: string;
  closureStatus: string;
};

type BuffetRecord = Awaited<
  ReturnType<typeof getMonthlyBuffetRecords>
>[number];

function parseMonth(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function parseYear(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : null;
}

function getConfiguredUnitName(): string {
  return (
    process.env.STAYSAFE_UNIT_NAME?.trim() ||
    process.env.BPMA_UNIT_NAME?.trim() ||
    "Unidade não informada"
  );
}

function getMonthName(month: number): string {
  const monthNames = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO"
  ];

  return monthNames[month - 1] ?? "";
}

function formatMonthYear(month: number, year: number): string {
  return `${getMonthName(month)} ${year}`;
}

function formatGeneratedAtSentence(date: Date): string {
  const [datePart, timePart] = formatAppDateTime(date).split(" ");
  return `${datePart} às ${timePart ?? ""}`.trim();
}

function valueOrDash(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized || "-";
}

function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  })} °C`;
}

function formatRecordTemperature(
  record: Pick<
    BuffetRecord,
    | "status"
    | "usaGarrafaTermica"
    | "temperaturaAmbiente"
    | "tcEquipamento"
    | "primeiraTc"
  >,
  field: "equipamento" | "produto"
): string {
  if (record.status === StatusItemBuffetAmostra.NAO_SERVIDO) {
    return field === "produto" ? "Não servido" : "-";
  }

  if (field === "equipamento" && record.usaGarrafaTermica) {
    return THERMAL_BOTTLE_EQUIPMENT_LABEL;
  }

  if (record.temperaturaAmbiente) {
    return "Ambiente";
  }

  return field === "equipamento"
    ? formatTemperature(record.tcEquipamento)
    : formatTemperature(record.primeiraTc);
}

function getProductLabel(record: Pick<BuffetRecord, "itemNome" | "itemExtra" | "observacao">): string {
  const productName = valueOrDash(record.itemNome);
  const cakeName = /^bolo\s*\d+$/i.test(productName) ? record.observacao?.trim() : "";
  const label = cakeName ? `${productName} - ${cakeName}` : productName;
  return record.itemExtra && productName !== "-" ? `${label} (extra)` : label;
}

function compareBuffetRecords(first: BuffetRecord, second: BuffetRecord): number {
  const itemExtraCompare = Number(first.itemExtra) - Number(second.itemExtra);
  if (itemExtraCompare !== 0) {
    return itemExtraCompare;
  }

  const firstOrder = first.item?.ordem ?? Number.MAX_SAFE_INTEGER;
  const secondOrder = second.item?.ordem ?? Number.MAX_SAFE_INTEGER;
  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return first.itemNome.localeCompare(second.itemNome, "pt-BR");
}

function buildServiceTitle(record: BuffetRecord): string {
  return `${record.servico.nome.toLocaleUpperCase("pt-BR")} - ${formatAppDate(record.data)}`;
}

function buildServiceTables(
  records: BuffetRecord[],
  supervisorByDate: Map<string, string>
): BuffetServiceTable[] {
  const groupsByKey = new Map<
    string,
    {
      serviceOrder: number;
      dateTime: number;
      title: string;
      records: BuffetRecord[];
    }
  >();

  for (const record of records) {
    if (record.status === StatusItemBuffetAmostra.NAO_SERVIDO) continue;
    const dataInput = formatAppDateInput(record.data);
    const key = `${dataInput}:${record.servicoId}`;
    const group = groupsByKey.get(key) ?? {
      serviceOrder: record.servico.ordem,
      dateTime: record.data.getTime(),
      title: buildServiceTitle(record),
      records: []
    };

    group.records.push(record);
    groupsByKey.set(key, group);
  }

  return Array.from(groupsByKey.entries())
    .sort(([, first], [, second]) => {
      if (first.dateTime !== second.dateTime) {
        return first.dateTime - second.dateTime;
      }

      if (first.serviceOrder !== second.serviceOrder) {
        return first.serviceOrder - second.serviceOrder;
      }

      return first.title.localeCompare(second.title, "pt-BR");
    })
    .map(([key, group]) => ({
      key,
      title: group.title,
      rows: group.records.sort(compareBuffetRecords).map((record) => ({
        produto: getProductLabel(record),
        temperaturaEquipamento: formatRecordTemperature(record, "equipamento"),
        temperaturaProduto: formatRecordTemperature(record, "produto"),
        acaoCorretiva:
          record.status === StatusItemBuffetAmostra.NAO_SERVIDO
            ? "-"
            : valueOrDash(record.acaoCorretiva),
        responsavel: valueOrDash(record.responsavelNome),
        supervisor: valueOrDash(supervisorByDate.get(formatAppDateInput(record.data)))
      }))
    }));
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStyles(): string {
  return `
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        background: #ffffff;
        color: #000000;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10.5px;
        line-height: 1.35;
      }

      body {
        padding: 16px;
      }

      .report-page {
        max-width: 980px;
        margin: 0 auto;
        background: #ffffff;
      }

      .screen-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-bottom: 10px;
      }

      .screen-actions button {
        border: 1px solid #111827;
        border-radius: 6px;
        background: #111827;
        color: #ffffff;
        cursor: pointer;
        font-size: 12px;
        padding: 7px 10px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        color: #000000;
      }

      th,
      td {
        border: 1px solid #000000;
        padding: 5px 6px;
        vertical-align: top;
        text-align: left;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      th {
        background: #f2f2f2;
        font-weight: 700;
        text-align: center;
      }

      .header-table {
        table-layout: fixed;
        margin-bottom: 8px;
      }

      .brand-cell {
        width: 20%;
        font-size: 13px;
        text-align: center;
        vertical-align: middle;
      }

      .brand-cell span {
        display: block;
        margin-top: 3px;
        font-size: 9px;
        font-weight: 400;
      }

      .title-cell {
        width: 54%;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0;
        text-align: center;
        vertical-align: middle;
      }

      .month-cell {
        width: 26%;
        font-size: 11px;
        text-align: center;
        vertical-align: middle;
      }

      .meta-line {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 10px;
      }

      .service-block {
        break-before: page;
        page-break-before: always;
        margin-top: 0;
      }

      .service-block:first-of-type {
        break-before: auto;
        page-break-before: auto;
      }

      .service-title {
        border: 1px solid #000000;
        border-bottom: 0;
        background: #f2f2f2;
        font-size: 13px;
        font-weight: 700;
        margin: 0;
        padding: 7px 8px;
        text-align: center;
        text-transform: uppercase;
        break-after: avoid;
        page-break-after: avoid;
      }

      .service-table {
        table-layout: fixed;
      }

      .service-table th:nth-child(1),
      .service-table td:nth-child(1) {
        width: 28%;
      }

      .service-table th:nth-child(2),
      .service-table td:nth-child(2) {
        width: 12%;
        text-align: center;
      }

      .service-table th:nth-child(3),
      .service-table td:nth-child(3) {
        width: 10%;
        text-align: center;
      }

      .service-table th:nth-child(4),
      .service-table td:nth-child(4) {
        width: 18%;
      }

      .service-table th:nth-child(5),
      .service-table td:nth-child(5) {
        width: 16%;
      }

      .service-table th:nth-child(6),
      .service-table td:nth-child(6) {
        width: 16%;
      }

      .empty-message {
        height: 28px;
        text-align: center;
      }

      tfoot {
        display: table-footer-group;
      }

      .signature-wrapper {
        border: 0;
        padding: 12px 0 0;
      }

      .signature-table {
        table-layout: fixed;
      }

      .signature-table th,
      .signature-table td {
        height: 30px;
        text-align: left;
        white-space: nowrap;
        vertical-align: middle;
      }

      .signature-table th:first-child {
        width: 38%;
      }

      .signature-table td:nth-child(2) {
        width: 34%;
      }

      .signature-table th:nth-child(3) {
        width: 7%;
      }

      .signature-table td:nth-child(4) {
        width: 21%;
      }

      @media print {
        body {
          padding: 0;
        }

        .screen-actions {
          display: none;
        }

        .report-page {
          max-width: none;
        }

        thead {
          display: table-header-group;
        }

        tfoot {
          display: table-footer-group;
        }

        tr {
          break-inside: avoid;
        }
      }
    </style>`;
}

function renderHeader(report: MonthlyBuffetReport): string {
  return `
    <header>
      <table class="header-table">
        <tbody>
          <tr>
            <td class="brand-cell">
              <strong>${escapeHtml(APP_NAME)}</strong>
              <span>${escapeHtml(report.unitName)}</span>
            </td>
            <td class="title-cell">${escapeHtml(REPORT_TITLE)}</td>
            <td class="month-cell">
              <strong>Mês/Ano</strong><br />
              ${escapeHtml(report.monthYearLabel)}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="meta-line">
        <span><strong>Relatório:</strong> ${escapeHtml(REPORT_NAME)}</span>
        <span><strong>Módulo:</strong> ${escapeHtml(MODULE_NAME)}</span>
        <span><strong>Emissão:</strong> ${escapeHtml(report.emittedAt)}</span>
        <span><strong>Fechamento mensal:</strong> ${escapeHtml(report.closureStatus)}</span>
      </div>
    </header>`;
}

function renderSignatureTable(report: MonthlyBuffetReport): string {
  const responsible =
    report.closureResponsible.trim() || "________________________________________";
  const date = report.closureDate.trim() || "___/___/____";

  return `
    <table class="signature-table">
      <tbody>
        <tr>
          <th>Responsável Técnico ou Nutricionista:</th>
          <td>${escapeHtml(responsible)}</td>
          <th>Data:</th>
          <td>${escapeHtml(date)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderServiceTable(service: BuffetServiceTable, report: MonthlyBuffetReport): string {
  const rows =
    service.rows.length > 0
      ? service.rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.produto)}</td>
                <td>${escapeHtml(row.temperaturaEquipamento)}</td>
                <td>${escapeHtml(row.temperaturaProduto)}</td>
                <td>${escapeHtml(row.acaoCorretiva)}</td>
                <td>${escapeHtml(row.responsavel)}</td>
                <td>${escapeHtml(row.supervisor)}</td>
              </tr>`
          )
          .join("")
      : `
        <tr>
          <td colspan="6" class="empty-message">
            Nenhum registro encontrado para o período.
          </td>
        </tr>`;

  return `
    <section class="service-block">
      <h2 class="service-title">${escapeHtml(service.title)}</h2>
      <table class="service-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>T°C Equipamento</th>
            <th>T°C</th>
            <th>Ação Corretiva</th>
            <th>Responsável pela verificação</th>
            <th>Supervisor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="signature-wrapper">
              ${renderSignatureTable(report)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

function renderServices(report: MonthlyBuffetReport): string {
  if (report.services.length === 0) {
    const emptyService: BuffetServiceTable = {
      key: "empty",
      title: "CONTROLE DE BUFFET / AMOSTRAS",
      rows: []
    };

    return renderServiceTable(emptyService, report);
  }

  return report.services.map((service) => renderServiceTable(service, report)).join("");
}

function renderReportDocument(report: MonthlyBuffetReport): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(REPORT_TITLE)} - ${escapeHtml(report.monthYearLabel)}</title>
    ${renderStyles()}
  </head>
  <body>
    <main class="report-page">
      <div class="screen-actions">
        <button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
      </div>
      ${renderHeader(report)}
      ${renderServices(report)}
    </main>
  </body>
</html>`;
}

async function getMonthlyBuffetRecords(month: number, year: number) {
  const monthRange = getAppMonthDateRange(month, year);

  return prisma.controleBuffetAmostraRegistro.findMany({
    where: {
      data: {
        gte: monthRange.start,
        lte: monthRange.end
      }
    },
    select: {
      id: true,
      data: true,
      servicoId: true,
      itemNome: true,
      observacao: true,
      itemExtra: true,
      tcEquipamento: true,
      primeiraTc: true,
      usaGarrafaTermica: true,
      temperaturaAmbiente: true,
      acaoCorretiva: true,
      responsavelNome: true,
      dataHoraRegistro: true,
      status: true,
      servico: {
        select: {
          nome: true,
          ordem: true
        }
      },
      item: {
        select: {
          ordem: true
        }
      }
    },
    orderBy: [
      { data: "asc" },
      { servico: { ordem: "asc" } },
      { servico: { nome: "asc" } },
      { dataHoraRegistro: "asc" },
      { id: "asc" }
    ]
  });
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!canAccessReports(user)) {
    return NextResponse.redirect(new URL("/acesso-negado", request.url));
  }

  const currentMonthYear = getAppMonthYear(getAppDate());
  const month = parseMonth(request.nextUrl.searchParams.get("mes")) ?? currentMonthYear.mes;
  const year = parseYear(request.nextUrl.searchParams.get("ano")) ?? currentMonthYear.ano;
  const monthRange = getAppMonthDateRange(month, year);
  const generatedAt = getAppNow();

  const [records, dailySignatures, genericMonthlyClosure, legacyMonthlyClosure] = await Promise.all([
    getMonthlyBuffetRecords(month, year),
    prisma.assinaturaDiariaModulo.findMany({
      where: {
        moduloCodigo: MODULE_CODE,
        dataReferencia: {
          gte: monthRange.start,
          lte: monthRange.end
        }
      },
      select: {
        dataReferencia: true,
        usuarioNomeSnapshot: true
      }
    }),
    prisma.fechamentoMensalModulo.findUnique({
      where: {
        moduloCodigo_ano_mes: {
          moduloCodigo: MODULE_CODE,
          ano: year,
          mes: month
        }
      }
    }),
    prisma.controleBuffetAmostraFechamento.findUnique({
      where: { mes_ano: { mes: month, ano: year } }
    })
  ]);

  const legacySigned =
    legacyMonthlyClosure?.status === StatusFechamentoBuffetAmostra.ASSINADO;
  const closureResponsible =
    genericMonthlyClosure?.usuarioNomeSnapshot ??
    (legacySigned ? legacyMonthlyClosure.responsavelTecnico : "");
  const closureDate =
    genericMonthlyClosure
      ? formatGeneratedAtSentence(genericMonthlyClosure.assinadoEm)
      : legacySigned
        ? formatGeneratedAtSentence(legacyMonthlyClosure.dataAssinatura)
        : "";

  const supervisorByDate = new Map(
    dailySignatures.map((signature) => [
      formatAppDateInput(signature.dataReferencia),
      signature.usuarioNomeSnapshot
    ])
  );

  const report: MonthlyBuffetReport = {
    monthYearLabel: formatMonthYear(month, year),
    unitName: getConfiguredUnitName(),
    emittedAt: formatAppDateTime(generatedAt),
    services: buildServiceTables(records, supervisorByDate),
    closureResponsible,
    closureDate,
    closureStatus: closureResponsible ? "Assinado digitalmente" : "Pendente de assinatura"
  };

  return new NextResponse(renderReportDocument(report), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
