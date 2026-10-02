import { NextResponse, type NextRequest } from "next/server";

import {
  StatusFechamentoPlanoLimpeza,
  StatusPlanoLimpeza,
  TipoPlanoLimpeza
} from "@prisma/client";

import { getReportIdentity } from "@/lib/visual-personalization";
import { renderReportIdentity, REPORT_IDENTITY_CSS, REPORT_PRINT_SCRIPT } from "@/lib/report-identity";
import { getCurrentUser } from "@/lib/auth-session";
import {
  formatAppDate,
  formatAppDateInput,
  formatAppDateTime,
  getAppDate,
  getAppMonthDateRange,
  getAppMonthYear,
  getAppNow,
  getAppWeekDateRange
} from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { canAccessReports } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MODULE_CODE = "limpeza_semanal";
const MODULE_NAME = "Plano de Limpeza Semanal";
const REPORT_TITLE = "PLANO DE LIMPEZA SEMANAL";
const REPORT_NAME = "Relatório mensal - plano de limpeza semanal por área";

type WeeklyRecord = Awaited<ReturnType<typeof getMonthlyWeeklyRecords>>[number];
type WeeklyAreaConfig = Awaited<ReturnType<typeof getWeeklyAreaConfigs>>[number];
type WeeklyItemConfig = Awaited<ReturnType<typeof getWeeklyItemConfigs>>[number];

type WeekBlock = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  visibleStart: Date;
  visibleEnd: Date;
};

type AreaItem = {
  key: string;
  itemId: number | null;
  label: string;
  order: number;
  configured: boolean;
};

type AreaReport = {
  key: string;
  areaName: string;
  monthLabel: string;
  items: AreaItem[];
  weeks: WeekBlock[];
  recordsByWeekItem: Map<string, WeeklyRecord[]>;
};

type MonthlyWeeklyCleaningReport = {
  month: number;
  year: number;
  monthYearLabel: string;
  unitName: string;
  logoDataUrl: string | null;
  emittedAt: string;
  areas: AreaReport[];
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

function getWeekOrdinal(index: number): string {
  return `${index + 1}ª semana`;
}

function minDate(first: Date, second: Date): Date {
  return first.getTime() <= second.getTime() ? first : second;
}

function maxDate(first: Date, second: Date): Date {
  return first.getTime() >= second.getTime() ? first : second;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildWeekBlocks(monthStart: Date, monthEnd: Date): WeekBlock[] {
  const firstWeekStart = getAppWeekDateRange(monthStart).start;
  const lastWeekStart = getAppWeekDateRange(monthEnd).start;
  const weeks: WeekBlock[] = [];

  for (
    let cursor = new Date(firstWeekStart);
    cursor.getTime() <= lastWeekStart.getTime();
    cursor = addDays(cursor, 7)
  ) {
    const weekRange = getAppWeekDateRange(cursor);
    weeks.push({
      key: formatAppDateInput(weekRange.start),
      label: getWeekOrdinal(weeks.length),
      start: weekRange.start,
      end: weekRange.end,
      visibleStart: maxDate(weekRange.start, monthStart),
      visibleEnd: minDate(weekRange.end, monthEnd)
    });
  }

  return weeks;
}

function getWeekPeriodLabel(week: WeekBlock): string {
  return `${formatAppDate(week.visibleStart)} a ${formatAppDate(week.visibleEnd)}`;
}

function getStatusLabel(status: StatusPlanoLimpeza): string {
  if (status === StatusPlanoLimpeza.CONCLUIDO) {
    return "Concluído";
  }

  if (status === StatusPlanoLimpeza.AGUARDANDO_SUPERVISOR) {
    return "Aguardando Supervisor";
  }

  return "Pendente";
}

function getOperationalStatus(record: WeeklyRecord | null): string {
  if (!record) {
    return "Pendente";
  }

  const hasResponsible =
    record.assinaturaResponsavel.trim().length > 0 ||
    Boolean(record.assinaturaResponsavelDataHora);
  const hasSupervisor =
    record.assinaturaSupervisor.trim().length > 0 ||
    Boolean(record.assinaturaSupervisorDataHora);

  if (hasResponsible && hasSupervisor) {
    return "Concluído";
  }

  if (hasResponsible) {
    return "Aguardando Supervisor";
  }

  return getStatusLabel(record.status);
}

function getRecordWeekKey(record: WeeklyRecord): string {
  return formatAppDateInput(getAppWeekDateRange(record.dataExecucao).start);
}

function getRecordItemKey(record: WeeklyRecord): string {
  return `item:${record.itemId}`;
}

function getItemKey(itemId: number): string {
  return `item:${itemId}`;
}

function getRecordItemLabel(record: WeeklyRecord): string {
  return valueOrDash(record.itemDescricao || record.item.oQueLimpar);
}

function getResponsibleName(record: WeeklyRecord | null): string {
  if (!record) {
    return "-";
  }

  return valueOrDash(record.assinaturaResponsavel || record.assinaturaResponsavelNomeUsuario);
}

function getSupervisorName(record: WeeklyRecord | null): string {
  if (!record) {
    return "-";
  }

  return valueOrDash(record.assinaturaSupervisor || record.assinaturaSupervisorNomeUsuario);
}

function getCleaningDate(record: WeeklyRecord | null): string {
  if (!record) {
    return "-";
  }

  if (record.assinaturaResponsavelDataHora) {
    return formatAppDate(record.assinaturaResponsavelDataHora);
  }

  if (record.assinaturaSupervisorDataHora) {
    return formatAppDate(record.assinaturaSupervisorDataHora);
  }

  return "-";
}

function getObservation(record: WeeklyRecord | null): string {
  if (!record) {
    return "-";
  }

  const responsibleNote = record.observacaoResponsavel?.trim();
  const supervisorNote = record.observacaoSupervisor?.trim();
  const notes: string[] = [];

  if (responsibleNote) {
    notes.push(`Responsável: ${responsibleNote}`);
  }

  if (supervisorNote) {
    notes.push(`Supervisor: ${supervisorNote}`);
  }

  return notes.length > 0 ? notes.join("\n") : "-";
}

function getSupervisorSignature(record: WeeklyRecord | null): string {
  const supervisorName = getSupervisorName(record);
  if (!record || supervisorName === "-") {
    return "-";
  }

  if (record.assinaturaSupervisorDataHora) {
    return `${supervisorName}\n${formatGeneratedAtSentence(record.assinaturaSupervisorDataHora)}`;
  }

  return supervisorName;
}

function getPreferredRecord(records: WeeklyRecord[]): WeeklyRecord | null {
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((first, second) => {
    const firstSignedAt =
      first.assinaturaSupervisorDataHora?.getTime() ??
      first.assinaturaResponsavelDataHora?.getTime() ??
      0;
    const secondSignedAt =
      second.assinaturaSupervisorDataHora?.getTime() ??
      second.assinaturaResponsavelDataHora?.getTime() ??
      0;

    if (firstSignedAt !== secondSignedAt) {
      return secondSignedAt - firstSignedAt;
    }

    return second.updatedAt.getTime() - first.updatedAt.getTime();
  })[0];
}

function getAreaItemDefinitions(params: {
  areaName: string;
  items: WeeklyItemConfig[];
  records: WeeklyRecord[];
}): AreaItem[] {
  const definitions = new Map<string, AreaItem>();

  for (const item of params.items.filter((item) => item.area === params.areaName)) {
    if (!item.ativo || item.excluidoEm) {
      continue;
    }

    definitions.set(getItemKey(item.id), {
      key: getItemKey(item.id),
      itemId: item.id,
      label: item.oQueLimpar,
      order: item.ordem,
      configured: true
    });
  }

  for (const record of params.records) {
    const key = getRecordItemKey(record);
    if (definitions.has(key)) {
      continue;
    }

    definitions.set(key, {
      key,
      itemId: record.itemId,
      label: getRecordItemLabel(record),
      order: record.item.ordem,
      configured: false
    });
  }

  return Array.from(definitions.values()).sort((first, second) => {
    if (first.order !== second.order) return first.order - second.order;
    if (first.configured !== second.configured) return first.configured ? -1 : 1;
    return first.label.localeCompare(second.label, "pt-BR");
  });
}

function buildRecordMap(areaRecords: WeeklyRecord[]): Map<string, WeeklyRecord[]> {
  const recordsByWeekItem = new Map<string, WeeklyRecord[]>();

  for (const record of areaRecords) {
    const key = `${getRecordWeekKey(record)}:${getRecordItemKey(record)}`;
    const records = recordsByWeekItem.get(key) ?? [];
    records.push(record);
    recordsByWeekItem.set(key, records);
  }

  return recordsByWeekItem;
}

function buildAreaReports(params: {
  monthLabel: string;
  weeks: WeekBlock[];
  areaConfigs: WeeklyAreaConfig[];
  itemConfigs: WeeklyItemConfig[];
  records: WeeklyRecord[];
}): AreaReport[] {
  const recordsByArea = new Map<string, WeeklyRecord[]>();
  for (const record of params.records) {
    const records = recordsByArea.get(record.area) ?? [];
    records.push(record);
    recordsByArea.set(record.area, records);
  }

  const candidateAreas = new Map<
    string,
    {
      areaName: string;
      order: number;
      hasConfig: boolean;
    }
  >();

  for (const areaConfig of params.areaConfigs) {
    if (areaConfig.ativo || recordsByArea.has(areaConfig.nome)) {
      candidateAreas.set(areaConfig.nome, {
        areaName: areaConfig.nome,
        order: areaConfig.ordem,
        hasConfig: true
      });
    }
  }

  for (const item of params.itemConfigs) {
    if (!item.ativo || item.excluidoEm || candidateAreas.has(item.area)) {
      continue;
    }

    candidateAreas.set(item.area, {
      areaName: item.area,
      order: Number.MAX_SAFE_INTEGER,
      hasConfig: false
    });
  }

  for (const areaName of recordsByArea.keys()) {
    if (!candidateAreas.has(areaName)) {
      candidateAreas.set(areaName, {
        areaName,
        order: Number.MAX_SAFE_INTEGER,
        hasConfig: false
      });
    }
  }

  return Array.from(candidateAreas.values())
    .sort((first, second) => {
      if (first.order !== second.order) return first.order - second.order;
      if (first.hasConfig !== second.hasConfig) return first.hasConfig ? -1 : 1;
      return first.areaName.localeCompare(second.areaName, "pt-BR");
    })
    .map((area) => {
      const areaRecords = recordsByArea.get(area.areaName) ?? [];

      return {
        key: area.areaName,
        areaName: area.areaName,
        monthLabel: params.monthLabel,
        items: getAreaItemDefinitions({
          areaName: area.areaName,
          items: params.itemConfigs,
          records: areaRecords
        }),
        weeks: params.weeks,
        recordsByWeekItem: buildRecordMap(areaRecords)
      };
    });
}

function getCellRecord(area: AreaReport, week: WeekBlock, item: AreaItem): WeeklyRecord | null {
  const records = area.recordsByWeekItem.get(`${week.key}:${item.key}`) ?? [];
  return getPreferredRecord(records);
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
      ${REPORT_IDENTITY_CSS}
      @page {
        size: A4 portrait;
        margin: 9mm;
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
        font-size: 9.3px;
        line-height: 1.3;
      }

      body {
        padding: 14px;
      }

      .report-page {
        max-width: 1040px;
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
        padding: 4px 5px;
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
        width: 21%;
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
        width: 53%;
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
        gap: 10px;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 9.5px;
      }

      .area-block {
        break-before: page;
        page-break-before: always;
        margin-top: 0;
      }

      .area-block:first-of-type {
        break-before: auto;
        page-break-before: auto;
      }

      .area-title {
        border: 1px solid #000000;
        border-bottom: 0;
        background: #f2f2f2;
        font-size: 12px;
        font-weight: 700;
        margin: 0;
        padding: 6px 8px;
        text-align: center;
        text-transform: uppercase;
        break-after: avoid;
        page-break-after: avoid;
      }

      .area-info {
        table-layout: fixed;
        margin-bottom: 8px;
      }

      .area-info th {
        width: 18%;
        text-align: left;
      }

      .week-section {
        margin-top: 8px;
      }

      .week-table {
        table-layout: fixed;
      }

      .week-title {
        font-size: 10.5px;
        text-transform: uppercase;
        break-after: avoid;
        page-break-after: avoid;
      }

      .week-period {
        display: block;
        margin-top: 2px;
        font-size: 8.6px;
        font-weight: 400;
        text-transform: none;
      }

      .item-column {
        width: 26%;
      }

      .date-column {
        width: 13%;
      }

      .responsible-column {
        width: 17%;
      }

      .status-column {
        width: 14%;
      }

      .observation-column {
        width: 17%;
      }

      .supervisor-column {
        width: 15%;
      }

      .week-table tbody td {
        min-height: 28px;
      }

      .empty-message {
        height: 30px;
        text-align: center;
      }

      .area-signature {
        margin-top: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
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
        width: 35%;
      }

      .signature-table th:nth-child(3) {
        width: 7%;
      }

      .signature-table td:nth-child(4) {
        width: 20%;
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

        tr,
        .area-title,
        .area-info,
        .area-signature {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>`;
}

function renderHeader(report: MonthlyWeeklyCleaningReport): string {
  return `
    <header>
      <table class="header-table">
        <tbody>
          <tr>
            <td class="brand-cell">
              ${renderReportIdentity(report)}
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

function renderSignatureTable(report: MonthlyWeeklyCleaningReport): string {
  const responsible =
    report.closureResponsible.trim() || "________________________________________";
  const date = report.closureDate.trim() || "___/___/____";

  return `
    <table class="signature-table">
      <tbody>
        <tr>
          <th>Supervisor / Responsável Técnico:</th>
          <td>${escapeHtml(responsible)}</td>
          <th>Data:</th>
          <td>${escapeHtml(date)}</td>
        </tr>
      </tbody>
    </table>`;
}

function renderWeekRows(area: AreaReport, week: WeekBlock): string {
  if (area.items.length === 0) {
    return `
      <tr>
        <td colspan="6" class="empty-message">Nenhum item configurado para esta área.</td>
      </tr>`;
  }

  return area.items
    .map((item) => {
      const record = getCellRecord(area, week, item);
      const itemLabel = record ? getRecordItemLabel(record) : item.label;

      return `
        <tr>
          <td>${escapeHtml(itemLabel)}</td>
          <td>${escapeHtml(getCleaningDate(record))}</td>
          <td>${escapeHtml(getResponsibleName(record))}</td>
          <td>${escapeHtml(getOperationalStatus(record))}</td>
          <td>${escapeHtml(getObservation(record))}</td>
          <td>${escapeHtml(getSupervisorSignature(record))}</td>
        </tr>`;
    })
    .join("");
}

function renderWeekTable(area: AreaReport, week: WeekBlock): string {
  const title = `${REPORT_TITLE}: ${area.areaName} ${week.label}`;

  return `
    <div class="week-section">
      <table class="week-table">
        <thead>
          <tr>
            <th colspan="6" class="week-title">
              ${escapeHtml(title)}
              <span class="week-period">Período: ${escapeHtml(getWeekPeriodLabel(week))}</span>
            </th>
          </tr>
          <tr>
            <th class="item-column">Itens</th>
            <th class="date-column">Data da limpeza</th>
            <th class="responsible-column">Responsável pela limpeza</th>
            <th class="status-column">Status do item</th>
            <th class="observation-column">Observações</th>
            <th class="supervisor-column">Assinatura supervisor</th>
          </tr>
        </thead>
        <tbody>
          ${renderWeekRows(area, week)}
        </tbody>
      </table>
    </div>`;
}

function renderArea(area: AreaReport, report: MonthlyWeeklyCleaningReport): string {
  return `
    <section class="area-block">
      <h2 class="area-title">${escapeHtml(`${REPORT_TITLE}: ${area.areaName}`)}</h2>
      <table class="area-info">
        <tbody>
          <tr>
            <th>Mês</th>
            <td>${escapeHtml(area.monthLabel)}</td>
          </tr>
          <tr>
            <th>Área</th>
            <td>${escapeHtml(area.areaName)}</td>
          </tr>
        </tbody>
      </table>
      ${area.weeks.map((week) => renderWeekTable(area, week)).join("")}
      <div class="area-signature">
        ${renderSignatureTable(report)}
      </div>
    </section>`;
}

function renderAreas(report: MonthlyWeeklyCleaningReport): string {
  if (report.areas.length === 0) {
    return `
      <section class="area-block">
        <h2 class="area-title">${escapeHtml(REPORT_TITLE)}</h2>
        <table>
          <tbody>
            <tr>
              <td class="empty-message">Nenhum registro encontrado para o período.</td>
            </tr>
          </tbody>
        </table>
        <div class="area-signature">
          ${renderSignatureTable(report)}
        </div>
      </section>`;
  }

  return report.areas.map((area) => renderArea(area, report)).join("");
}

function renderReportDocument(report: MonthlyWeeklyCleaningReport): string {
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
        <button type="button" onclick="printReport()">Imprimir / Salvar PDF</button>
      </div>
      ${renderHeader(report)}
      ${renderAreas(report)}
    </main>
    ${REPORT_PRINT_SCRIPT}
  </body>
</html>`;
}

async function getWeeklyAreaConfigs() {
  return prisma.planoLimpezaSemanalArea.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });
}

async function getWeeklyItemConfigs() {
  return prisma.planoLimpezaSemanalItem.findMany({
    where: { excluidoEm: null },
    orderBy: [{ area: "asc" }, { ordem: "asc" }, { oQueLimpar: "asc" }]
  });
}

async function getMonthlyWeeklyRecords(weeks: WeekBlock[]) {
  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];

  if (!firstWeek || !lastWeek) {
    return [];
  }

  return prisma.planoLimpezaSemanalExecucao.findMany({
    where: {
      dataExecucao: {
        gte: firstWeek.start,
        lte: lastWeek.end
      }
    },
    select: {
      id: true,
      dataExecucao: true,
      area: true,
      itemId: true,
      itemDescricao: true,
      assinaturaResponsavel: true,
      assinaturaResponsavelNomeUsuario: true,
      assinaturaResponsavelDataHora: true,
      assinaturaSupervisor: true,
      assinaturaSupervisorNomeUsuario: true,
      assinaturaSupervisorDataHora: true,
      observacaoResponsavel: true,
      observacaoSupervisor: true,
      status: true,
      updatedAt: true,
      item: {
        select: {
          id: true,
          ordem: true,
          oQueLimpar: true
        }
      }
    },
    orderBy: [
      { area: "asc" },
      { dataExecucao: "asc" },
      { item: { ordem: "asc" } },
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
  const weeks = buildWeekBlocks(monthRange.start, monthRange.end);
  const generatedAt = getAppNow();

  const [areaConfigs, itemConfigs, records, genericMonthlyClosure, legacyMonthlyClosure] =
    await Promise.all([
      getWeeklyAreaConfigs(),
      getWeeklyItemConfigs(),
      getMonthlyWeeklyRecords(weeks),
      prisma.fechamentoMensalModulo.findUnique({
        where: {
          moduloCodigo_ano_mes: {
            moduloCodigo: MODULE_CODE,
            ano: year,
            mes: month
          }
        }
      }),
      prisma.planoLimpezaFechamento.findUnique({
        where: {
          tipo_mes_ano: {
            tipo: TipoPlanoLimpeza.SEMANAL,
            mes: month,
            ano: year
          }
        }
      })
    ]);

  const legacySigned =
    legacyMonthlyClosure?.status === StatusFechamentoPlanoLimpeza.ASSINADO;
  const closureResponsible =
    genericMonthlyClosure?.usuarioNomeSnapshot ??
    (legacySigned ? legacyMonthlyClosure.responsavelTecnico : "");
  const closureDate =
    genericMonthlyClosure
      ? formatGeneratedAtSentence(genericMonthlyClosure.assinadoEm)
      : legacySigned
        ? formatGeneratedAtSentence(legacyMonthlyClosure.dataAssinatura)
        : "";
  const monthYearLabel = formatMonthYear(month, year);

  const identity = await getReportIdentity();
  const report: MonthlyWeeklyCleaningReport = {
    month,
    year,
    monthYearLabel,
    unitName: identity.unitName,
    logoDataUrl: identity.logoDataUrl,
    emittedAt: formatAppDateTime(generatedAt),
    areas: buildAreaReports({
      monthLabel: monthYearLabel,
      weeks,
      areaConfigs,
      itemConfigs,
      records
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
