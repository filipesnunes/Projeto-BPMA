import { NextResponse, type NextRequest } from "next/server";

import {
  ConformidadeRecebimento,
  StatusFechamentoRastreabilidadeRecebimento,
  TipoTemperaturaRecebimento
} from "@prisma/client";

import { formatSifDisplayValue } from "@/app/rastreabilidade-recebimento/sif";
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

export const dynamic = "force-dynamic";

const MODULE_CODE = OPERATIONAL_SIGNATURE_MODULES.rastreabilidade.codigo;
const MODULE_NAME = "Rastreabilidade e Recebimento de Mercadorias";
const REPORT_TITLE = "RASTREABILIDADE E RECEBIMENTO DE MERCADORIAS";
const REPORT_NAME = "Relatório mensal - rastreabilidade de recebimento";

type ReceivingReportRow = {
  data: string;
  produto: string;
  nf: string;
  loteFabricacao: string;
  sif: string;
  validade: string;
  quantidade: string;
  temperatura: string;
  transporte: string;
  aspecto: string;
  embalagem: string;
  acaoCorretiva: string;
  responsavel: string;
  supervisor: string;
};

type MonthlyReceivingReport = {
  monthYearLabel: string;
  unitName: string;
  emittedAt: string;
  rows: ReceivingReportRow[];
  closureResponsible: string;
  closureDate: string;
  closureStatus: string;
};

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

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4
  });
}

function formatQuantity(params: {
  quantidadeComprada: number | null;
  unidadeMedidaCompra: string | null;
  quantidadeTributavel: number | null;
  unidadeMedidaTributavel: string | null;
}): string {
  const quantity = params.quantidadeComprada ?? params.quantidadeTributavel;
  const unit =
    params.unidadeMedidaCompra?.trim() ||
    params.unidadeMedidaTributavel?.trim() ||
    "";

  if (quantity === null && !unit) {
    return "-";
  }

  if (quantity === null) {
    return unit;
  }

  return [formatNumber(quantity), unit].filter(Boolean).join(" ");
}

function formatTemperature(
  value: number | null,
  tipo: TipoTemperaturaRecebimento
): string {
  if (tipo === TipoTemperaturaRecebimento.AMBIENTE) {
    return "Ambiente";
  }

  if (tipo === TipoTemperaturaRecebimento.NAO_APLICAVEL) {
    return "Não se aplica";
  }

  if (value === null) {
    return "-";
  }

  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1
  })} °C`;
}

function formatLoteFabricacao(
  lote: string | null,
  dataFabricacao: Date | null,
  semDataFabricacao = false
): string {
  const parts: string[] = [];
  const normalizedLote = lote?.trim();

  if (normalizedLote) {
    parts.push(`Lote: ${normalizedLote}`);
  }

  if (semDataFabricacao) {
    parts.push("Sem data de fabricação");
  } else if (dataFabricacao) {
    parts.push(`Fab.: ${formatAppDate(dataFabricacao)}`);
  }

  return parts.length ? parts.join(" / ") : "-";
}

function formatValidity(
  dataValidade: Date | null,
  validadeNaoAplicavel: boolean
): string {
  if (validadeNaoAplicavel) {
    return "Não se aplica";
  }

  return dataValidade ? formatAppDate(dataValidade) : "-";
}

function labelConformidade(value: ConformidadeRecebimento | null): string {
  if (value === ConformidadeRecebimento.CONFORME) {
    return "Conforme";
  }

  if (value === ConformidadeRecebimento.NAO_CONFORME) {
    return "Não conforme";
  }

  return "-";
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
        size: A4 landscape;
        margin: 7mm;
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
        font-size: 9.5px;
        line-height: 1.35;
      }

      body {
        padding: 14px;
      }

      .report-page {
        max-width: 1480px;
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

      .table-wrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        color: #000000;
      }

      th,
      td {
        border: 1px solid #000000;
        padding: 3px 4px;
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

      .receiving-table {
        min-width: 1500px;
        table-layout: fixed;
      }

      .receiving-table th {
        font-size: 8.8px;
        line-height: 1.2;
      }

      .receiving-table td {
        line-height: 1.3;
      }

      .receiving-table th:nth-child(1),
      .receiving-table td:nth-child(1) {
        width: 4.8%;
        text-align: center;
      }

      .receiving-table th:nth-child(2),
      .receiving-table td:nth-child(2) {
        width: 13.5%;
      }

      .receiving-table th:nth-child(3),
      .receiving-table td:nth-child(3) {
        width: 4.8%;
        text-align: center;
      }

      .receiving-table th:nth-child(4),
      .receiving-table td:nth-child(4) {
        width: 10.5%;
      }

      .receiving-table th:nth-child(5),
      .receiving-table td:nth-child(5) {
        width: 4%;
        text-align: center;
      }

      .receiving-table th:nth-child(6),
      .receiving-table td:nth-child(6) {
        width: 7%;
        text-align: center;
      }

      .receiving-table th:nth-child(7),
      .receiving-table td:nth-child(7) {
        width: 5.6%;
        text-align: center;
      }

      .receiving-table th:nth-child(8),
      .receiving-table td:nth-child(8) {
        width: 5.8%;
        text-align: center;
      }

      .receiving-table th:nth-child(9),
      .receiving-table td:nth-child(9) {
        width: 5.4%;
        text-align: center;
      }

      .receiving-table th:nth-child(10),
      .receiving-table td:nth-child(10) {
        width: 5.2%;
        text-align: center;
      }

      .receiving-table th:nth-child(11),
      .receiving-table td:nth-child(11) {
        width: 5.2%;
        text-align: center;
      }

      .receiving-table th:nth-child(12),
      .receiving-table td:nth-child(12) {
        width: 7.2%;
      }

      .receiving-table th:nth-child(13),
      .receiving-table td:nth-child(13) {
        width: 10.5%;
      }

      .receiving-table th:nth-child(14),
      .receiving-table td:nth-child(14) {
        width: 10.5%;
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
        padding: 10px 0 0;
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
        width: 32%;
      }

      .signature-table td:nth-child(2) {
        width: 39%;
      }

      .signature-table th:nth-child(3) {
        width: 7%;
      }

      .signature-table td:nth-child(4) {
        width: 22%;
      }

      @media print {
        body {
          padding: 0;
          font-size: 9px;
        }

        .screen-actions {
          display: none;
        }

        .report-page {
          max-width: none;
        }

        .table-wrap {
          overflow: visible;
        }

        .receiving-table {
          min-width: 0;
        }

        th,
        td {
          padding: 2px 2.5px;
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

function renderHeader(report: MonthlyReceivingReport): string {
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

function renderSignatureTable(report: MonthlyReceivingReport): string {
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

function renderRecordsTable(report: MonthlyReceivingReport): string {
  const rows =
    report.rows.length > 0
      ? report.rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.data)}</td>
                <td>${escapeHtml(row.produto)}</td>
                <td>${escapeHtml(row.nf)}</td>
                <td>${escapeHtml(row.loteFabricacao)}</td>
                <td>${escapeHtml(row.sif)}</td>
                <td>${escapeHtml(row.validade)}</td>
                <td>${escapeHtml(row.quantidade)}</td>
                <td>${escapeHtml(row.temperatura)}</td>
                <td>${escapeHtml(row.transporte)}</td>
                <td>${escapeHtml(row.aspecto)}</td>
                <td>${escapeHtml(row.embalagem)}</td>
                <td>${escapeHtml(row.acaoCorretiva)}</td>
                <td>${escapeHtml(row.responsavel)}</td>
                <td>${escapeHtml(row.supervisor)}</td>
              </tr>`
          )
          .join("")
      : `
        <tr>
          <td colspan="14" class="empty-message">
            Nenhum registro encontrado para o período.
          </td>
        </tr>`;

  return `
    <div class="table-wrap">
      <table class="receiving-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Produto</th>
            <th>NF</th>
            <th>Lote / Data de fabricação</th>
            <th>SIF</th>
            <th>Data / Prazo de validade</th>
            <th>Quantidade</th>
            <th>Temperatura (°C)</th>
            <th>Transporte</th>
            <th>Aspecto</th>
            <th>Embalagem</th>
            <th>Ação corretiva</th>
            <th>Responsável</th>
            <th>Supervisor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="14" class="signature-wrapper">
              ${renderSignatureTable(report)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function renderReportDocument(report: MonthlyReceivingReport): string {
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
      ${renderRecordsTable(report)}
    </main>
  </body>
</html>`;
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
    prisma.rastreabilidadeRecebimentoRegistro.findMany({
      where: {
        data: {
          gte: monthRange.start,
          lte: monthRange.end
        }
      },
      select: {
        data: true,
        produto: true,
        notaFiscal: true,
        lote: true,
        dataFabricacao: true,
        semDataFabricacao: true,
        sif: true,
        dataValidade: true,
        validadeNaoAplicavel: true,
        quantidadeComprada: true,
        unidadeMedidaCompra: true,
        quantidadeTributavel: true,
        unidadeMedidaTributavel: true,
        temperatura: true,
        temperaturaTipo: true,
        transporteEntregador: true,
        aspectoSensorial: true,
        embalagem: true,
        acaoCorretiva: true,
        responsavelRecebimento: true,
        nota: {
          select: {
            notaFiscal: true
          }
        }
      },
      orderBy: [{ data: "asc" }, { notaFiscal: "asc" }, { produto: "asc" }, { id: "asc" }]
    }),
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
    prisma.rastreabilidadeRecebimentoFechamento.findUnique({
      where: { mes_ano: { mes: month, ano: year } }
    })
  ]);

  const legacySigned =
    legacyMonthlyClosure?.status === StatusFechamentoRastreabilidadeRecebimento.ASSINADO;
  const closureResponsible =
    genericMonthlyClosure?.usuarioNomeSnapshot ??
    (legacySigned ? legacyMonthlyClosure.responsavelTecnico : "");
  const closureDate =
    genericMonthlyClosure
      ? formatGeneratedAtSentence(genericMonthlyClosure.assinadoEm)
      : legacySigned
        ? formatGeneratedAtSentence(legacyMonthlyClosure.dataAssinatura)
        : "";

  const dailySignaturesByDate = new Map(
    dailySignatures.map((signature) => [
      formatAppDateInput(signature.dataReferencia),
      signature
    ])
  );

  const report: MonthlyReceivingReport = {
    monthYearLabel: formatMonthYear(month, year),
    unitName: getConfiguredUnitName(),
    emittedAt: formatAppDateTime(generatedAt),
    rows: records.map((record) => {
      const dailySignature = dailySignaturesByDate.get(formatAppDateInput(record.data));

      return {
        data: formatAppDate(record.data),
        produto: valueOrDash(record.produto),
        nf: valueOrDash(record.notaFiscal || record.nota?.notaFiscal),
        loteFabricacao: formatLoteFabricacao(record.lote, record.dataFabricacao, record.semDataFabricacao),
        sif: formatSifDisplayValue(record.sif),
        validade: formatValidity(record.dataValidade, record.validadeNaoAplicavel),
        quantidade: formatQuantity(record),
        temperatura: formatTemperature(record.temperatura, record.temperaturaTipo),
        transporte: labelConformidade(record.transporteEntregador),
        aspecto: labelConformidade(record.aspectoSensorial),
        embalagem: labelConformidade(record.embalagem),
        acaoCorretiva: valueOrDash(record.acaoCorretiva),
        responsavel: valueOrDash(record.responsavelRecebimento),
        supervisor: valueOrDash(dailySignature?.usuarioNomeSnapshot)
      };
    }),
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
