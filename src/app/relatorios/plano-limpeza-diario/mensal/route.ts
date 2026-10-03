import { reopenedMonthlyReportLabel } from "@/lib/monthly-reopening";
import { NextResponse, type NextRequest } from "next/server";

import {
  StatusFechamentoPlanoLimpeza,
  TipoPlanoLimpeza,
  TurnoPlanoLimpeza
} from "@prisma/client";

import { getReportIdentity } from "@/lib/visual-personalization";
import { renderReportIdentity, REPORT_IDENTITY_CSS, REPORT_PRINT_SCRIPT } from "@/lib/report-identity";
import { getCurrentUser } from "@/lib/auth-session";
import {
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

const MODULE_CODE = OPERATIONAL_SIGNATURE_MODULES.limpeza_diaria.codigo;
const MODULE_NAME = "Plano de Limpeza Diário por Área";
const REPORT_TITLE = "PLANO DE LIMPEZA - FREQUÊNCIA DIÁRIA";
const REPORT_NAME = "Relatório mensal - plano de limpeza diária por área";
const DEFAULT_SHIFTS = [TurnoPlanoLimpeza.MANHA, TurnoPlanoLimpeza.TARDE];
const SHIFT_ORDER = [
  TurnoPlanoLimpeza.MANHA,
  TurnoPlanoLimpeza.TARDE,
  TurnoPlanoLimpeza.NOITE
];

type DailyRecord = Awaited<ReturnType<typeof getMonthlyDailyRecords>>[number];
type DailyAreaConfig = Awaited<ReturnType<typeof getDailyAreaConfigs>>[number];

type WeekBlock = {
  label: string;
  days: number[];
};

type AreaReport = {
  key: string;
  title: string;
  areaName: string;
  monthLabel: string;
  sanitizedLocations: string;
  shifts: TurnoPlanoLimpeza[];
  weeks: WeekBlock[];
  recordsByDayShift: Map<string, DailyRecord[]>;
  supervisorByDate: Map<string, string>;
};

type MonthlyDailyCleaningReport = {
  month: number;
  year: number;
  monthYearLabel: string;
  unitName: string;
  logoDataUrl: string | null;
  logoLargura?: number;
  logoAlturaMaxima?: number;
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

function getWeekOrdinal(index: number): string {
  return `${index + 1}ª semana`;
}

function buildWeekBlocks(daysInMonth: number): WeekBlock[] {
  const weeks: WeekBlock[] = [];

  for (let startDay = 1; startDay <= daysInMonth; startDay += 7) {
    const endDay = Math.min(startDay + 6, daysInMonth);
    const days = Array.from({ length: endDay - startDay + 1 }, (_, index) => startDay + index);
    weeks.push({
      label: getWeekOrdinal(weeks.length),
      days
    });
  }

  return weeks;
}

function getShiftLabel(turno: TurnoPlanoLimpeza): string {
  if (turno === TurnoPlanoLimpeza.MANHA) return "Manhã";
  if (turno === TurnoPlanoLimpeza.TARDE) return "Tarde";
  return "Noite";
}

function uniqueDisplayValues(values: Array<string | null | undefined>): string {
  const uniqueValues = Array.from(
    new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))
  );

  return uniqueValues.join(", ");
}

function sortShifts(shifts: TurnoPlanoLimpeza[]): TurnoPlanoLimpeza[] {
  return Array.from(new Set(shifts)).sort(
    (first, second) => SHIFT_ORDER.indexOf(first) - SHIFT_ORDER.indexOf(second)
  );
}

function getConfiguredShifts(
  areaConfig: DailyAreaConfig | null,
  areaRecords: DailyRecord[]
): TurnoPlanoLimpeza[] {
  const configured: TurnoPlanoLimpeza[] = [];

  if (areaConfig?.turnoManha) configured.push(TurnoPlanoLimpeza.MANHA);
  if (areaConfig?.turnoTarde) configured.push(TurnoPlanoLimpeza.TARDE);
  if (areaConfig?.turnoNoite) configured.push(TurnoPlanoLimpeza.NOITE);

  if (configured.length > 0) {
    return configured;
  }

  const recordShifts = sortShifts(areaRecords.map((record) => record.turno));
  return recordShifts.length > 0 ? recordShifts : DEFAULT_SHIFTS;
}

function getSanitizedLocations(
  areaConfig: DailyAreaConfig | null,
  areaRecords: DailyRecord[]
): string {
  const configuredLocations =
    areaConfig?.itens
      .filter((item) => item.ativo && !item.excluidoEm)
      .sort((first, second) => {
        if (first.ordem !== second.ordem) return first.ordem - second.ordem;
        return first.descricao.localeCompare(second.descricao, "pt-BR");
      })
      .map((item) => item.descricao.trim())
      .filter(Boolean) ?? [];

  if (configuredLocations.length > 0) {
    return configuredLocations.join(", ");
  }

  const historicalLocations = uniqueDisplayValues(
    areaRecords.map((record) => record.itemDescricao)
  );

  return historicalLocations || "-";
}

function buildRecordMap(areaRecords: DailyRecord[]): Map<string, DailyRecord[]> {
  const recordsByDayShift = new Map<string, DailyRecord[]>();

  for (const record of areaRecords) {
    const day = record.data.getUTCDate();
    const key = `${day}:${record.turno}`;
    const records = recordsByDayShift.get(key) ?? [];
    records.push(record);
    recordsByDayShift.set(key, records);
  }

  return recordsByDayShift;
}

function getAreaTitle(areaName: string): string {
  return `${REPORT_TITLE} ${areaName}`.toLocaleUpperCase("pt-BR");
}

function buildAreaReports(params: {
  monthYearLabel: string;
  daysInMonth: number;
  areaConfigs: DailyAreaConfig[];
  records: DailyRecord[];
  supervisorByDate: Map<string, string>;
}): AreaReport[] {
  const recordsByArea = new Map<string, DailyRecord[]>();
  for (const record of params.records) {
    const records = recordsByArea.get(record.area) ?? [];
    records.push(record);
    recordsByArea.set(record.area, records);
  }

  const configByArea = new Map(params.areaConfigs.map((area) => [area.nome, area]));
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
      const areaConfig = configByArea.get(area.areaName) ?? null;
      const areaRecords = recordsByArea.get(area.areaName) ?? [];

      return {
        key: area.areaName,
        title: getAreaTitle(area.areaName),
        areaName: area.areaName,
        monthLabel: params.monthYearLabel,
        sanitizedLocations: getSanitizedLocations(areaConfig, areaRecords),
        shifts: getConfiguredShifts(areaConfig, areaRecords),
        weeks: buildWeekBlocks(params.daysInMonth),
        recordsByDayShift: buildRecordMap(areaRecords),
        supervisorByDate: params.supervisorByDate
      };
    });
}

function getCellRecords(
  area: AreaReport,
  day: number,
  turno: TurnoPlanoLimpeza
): DailyRecord[] {
  return area.recordsByDayShift.get(`${day}:${turno}`) ?? [];
}

function getResponsibleCellValue(records: DailyRecord[]): string {
  return uniqueDisplayValues(
    records.map(
      (record) => record.assinaturaResponsavel || record.assinaturaResponsavelNomeUsuario
    )
  );
}

function getSupervisorCellValue(records: DailyRecord[], supervisorByDate: Map<string, string>): string {
  if (records.length === 0) {
    return "";
  }

  return supervisorByDate.get(formatAppDateInput(records[0].data))?.trim() ?? "";
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
        size: A4 landscape;
        margin: 8mm;
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
        font-size: 8.6px;
        line-height: 1.28;
      }

      body {
        padding: 14px;
      }

      .report-page {
        max-width: 1420px;
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
        font-size: 13px;
        font-weight: 700;
        margin: 0;
        padding: 7px 8px;
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

      .week-table {
        table-layout: fixed;
        margin-top: 8px;
      }

      .week-title {
        font-size: 10px;
        text-transform: uppercase;
      }

      .shift-head,
      .shift-cell {
        width: 9%;
        text-align: center;
        vertical-align: middle;
      }

      .field-head,
      .field-cell {
        width: 10%;
        text-align: center;
        vertical-align: middle;
      }

      .day-head,
      .day-cell {
        text-align: center;
        vertical-align: top;
      }

      .day-cell {
        min-height: 24px;
      }

      .empty-message {
        height: 28px;
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
        width: 34%;
      }

      .signature-table td:nth-child(2) {
        width: 38%;
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

        tr {
          break-inside: avoid;
        }
      }
    </style>`;
}

function renderHeader(report: MonthlyDailyCleaningReport): string {
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

function renderSignatureTable(report: MonthlyDailyCleaningReport): string {
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

function renderWeekTable(area: AreaReport, week: WeekBlock): string {
  const dayHeaders = week.days
    .map((day) => `<th class="day-head">Dia ${day}</th>`)
    .join("");
  const rows = area.shifts
    .flatMap((turno) => {
      const responsibleCells = week.days
        .map((day) => {
          const records = getCellRecords(area, day, turno);
          return `<td class="day-cell">${escapeHtml(getResponsibleCellValue(records))}</td>`;
        })
        .join("");
      const supervisorCells = week.days
        .map((day) => {
          const records = getCellRecords(area, day, turno);
          return `<td class="day-cell">${escapeHtml(getSupervisorCellValue(records, area.supervisorByDate))}</td>`;
        })
        .join("");

      return [
        `
          <tr>
            <th class="shift-cell" rowspan="2">${escapeHtml(getShiftLabel(turno))}</th>
            <th class="field-cell">Responsáveis</th>
            ${responsibleCells}
          </tr>`,
        `
          <tr>
            <th class="field-cell">Supervisão</th>
            ${supervisorCells}
          </tr>`
      ];
    })
    .join("");

  return `
    <table class="week-table">
      <thead>
        <tr>
          <th colspan="${week.days.length + 2}" class="week-title">${escapeHtml(week.label)}</th>
        </tr>
        <tr>
          <th class="shift-head">Turno</th>
          <th class="field-head">Campo</th>
          ${dayHeaders}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderArea(area: AreaReport, report: MonthlyDailyCleaningReport): string {
  return `
    <section class="area-block">
      <h2 class="area-title">${escapeHtml(area.title)}</h2>
      <table class="area-info">
        <tbody>
          <tr>
            <th>Mês</th>
            <td>${escapeHtml(area.monthLabel)}</td>
          </tr>
          <tr>
            <th>Locais higienizados diariamente</th>
            <td>${escapeHtml(area.sanitizedLocations)}</td>
          </tr>
        </tbody>
      </table>
      ${area.weeks.map((week) => renderWeekTable(area, week)).join("")}
      <div class="area-signature">
        ${renderSignatureTable(report)}
      </div>
    </section>`;
}

function renderAreas(report: MonthlyDailyCleaningReport): string {
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

function renderReportDocument(report: MonthlyDailyCleaningReport): string {
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

async function getDailyAreaConfigs() {
  return prisma.planoLimpezaDiarioArea.findMany({
    include: {
      itens: {
        where: { excluidoEm: null },
        orderBy: [{ ordem: "asc" }, { descricao: "asc" }]
      }
    },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }]
  });
}

async function getMonthlyDailyRecords(month: number, year: number) {
  const monthRange = getAppMonthDateRange(month, year);

  return prisma.planoLimpezaDiarioRegistro.findMany({
    where: {
      data: {
        gte: monthRange.start,
        lte: monthRange.end
      }
    },
    select: {
      id: true,
      data: true,
      turno: true,
      area: true,
      itemDescricao: true,
      assinaturaResponsavel: true,
      assinaturaResponsavelNomeUsuario: true
    },
    orderBy: [{ data: "asc" }, { area: "asc" }, { turno: "asc" }, { id: "asc" }]
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
  const daysInMonth = monthRange.end.getUTCDate();
  const generatedAt = getAppNow();

  const [areaConfigs, records, dailySignatures, genericMonthlyClosure, legacyMonthlyClosure] =
    await Promise.all([
      getDailyAreaConfigs(),
      getMonthlyDailyRecords(month, year),
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
      where: { status: "FECHADO",
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
            tipo: TipoPlanoLimpeza.DIARIO,
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
  const supervisorByDate = new Map(
    dailySignatures.map((signature) => [
      formatAppDateInput(signature.dataReferencia),
      signature.usuarioNomeSnapshot
    ])
  );

  const reopenedLabel = await reopenedMonthlyReportLabel("limpeza_diaria", month, year);
  const identity = await getReportIdentity();
  const report: MonthlyDailyCleaningReport = {
    month,
    year,
    monthYearLabel,
    unitName: identity.unitName,
    logoDataUrl: identity.logoDataUrl,
    logoLargura: identity.logoLargura,
    logoAlturaMaxima: identity.logoAlturaMaxima,
    emittedAt: formatAppDateTime(generatedAt),
    areas: buildAreaReports({
      monthYearLabel,
      daysInMonth,
      areaConfigs,
      records,
      supervisorByDate
    }),
    closureResponsible,
    closureDate,
    closureStatus: reopenedLabel ?? (closureResponsible ? "Assinado digitalmente" : "Pendente de assinatura")
  };

  return new NextResponse(renderReportDocument(report), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
