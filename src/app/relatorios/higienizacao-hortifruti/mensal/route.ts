import { reopenedMonthlyReportLabel } from "@/lib/monthly-reopening";
import { NextResponse, type NextRequest } from "next/server";

import { APP_NAME } from "@/lib/app-branding";
import { getReportIdentity } from "@/lib/visual-personalization";
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
import {
  renderMonthlySanitaryReportDocument,
  type MonthlySanitaryReport
} from "@/lib/monthly-sanitary-report";
import { prisma } from "@/lib/prisma";
import { canAccessReports } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const MODULE_CODE = "hortifruti";
const MODULE_NAME = "Higienização de Hortifruti";
const REPORT_TITLE = "HIGIENIZAÇÃO DE HORTIFRUTI";
const REPORT_NAME = "Relatório mensal sanitário";
const ANNEX_CODE = "ANEXO 3";
const REVISION = "00";
const ELABORATION_DATE = "06/01/2021";

function parseMonth(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : null;
}

function parseYear(value: string | null): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : null;
}

function formatMonthYear(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function formatGeneratedAtSentence(date: Date): string {
  const [datePart, timePart] = formatAppDateTime(date).split(" ");
  return `${datePart} às ${timePart ?? ""}`.trim();
}

function getDaysInMonth(monthEnd: Date): number {
  return monthEnd.getUTCDate();
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
  const generatedAtSentence = formatGeneratedAtSentence(generatedAt);

  const [records, dailySignatures, monthlyClosure] = await Promise.all([
    prisma.higienizacaoHortifruti.findMany({
      where: {
        data: {
          gte: monthRange.start,
          lte: monthRange.end
        }
      },
      orderBy: [{ data: "asc" }, { inicioProcesso: "asc" }, { id: "asc" }]
    }),
    prisma.assinaturaDiariaModulo.findMany({
      where: {
        moduloCodigo: MODULE_CODE,
        dataReferencia: {
          gte: monthRange.start,
          lte: monthRange.end
        }
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
    })
  ]);

  const recordDates = new Set(records.map((record) => formatAppDateInput(record.data)));
  const dailySignaturesByDate = new Map(
    dailySignatures.map((signature) => [
      formatAppDateInput(signature.dataReferencia),
      signature.usuarioNomeSnapshot
    ])
  );
  const signedRecordDates = new Set(
    dailySignatures
      .filter((signature) => recordDates.has(formatAppDateInput(signature.dataReferencia)))
      .map((signature) => formatAppDateInput(signature.dataReferencia))
  );
  const daysWithRecords = recordDates.size;
  const daysWithoutRecords = Math.max(getDaysInMonth(monthRange.end) - daysWithRecords, 0);
  const pendingDailySignatures = Math.max(daysWithRecords - signedRecordDates.size, 0);
  const recordsWithObservation = records.filter((record) =>
    Boolean(record.observacoes?.trim())
  ).length;
  const referenceMonthYear = formatMonthYear(month, year);

  const reopenedLabel = await reopenedMonthlyReportLabel("hortifruti", month, year);
  const identity = await getReportIdentity();
  const report: MonthlySanitaryReport = {
    title: REPORT_TITLE,
    reportName: REPORT_NAME,
    annexCode: ANNEX_CODE,
    revision: REVISION,
    elaborationDate: ELABORATION_DATE,
    referenceMonthYear,
    unitName: identity.unitName,
    logoDataUrl: identity.logoDataUrl,
    logoLargura: identity.logoLargura,
    logoAlturaMaxima: identity.logoAlturaMaxima,
    moduleName: MODULE_NAME,
    brandName: APP_NAME,
    emittedAt: formatAppDateTime(generatedAt),
    generatedAtSentence,
    footerResponsibleName: monthlyClosure?.usuarioNomeSnapshot ?? "",
    footerDate: generatedAtSentence,
    summaryItems: [
      { label: "Total de registros", value: records.length },
      { label: "Total de dias com registro", value: daysWithRecords },
      { label: "Total de dias sem registro", value: daysWithoutRecords },
      { label: "Total de alertas", value: 0 },
      { label: "Total de não conformidades", value: 0 },
      { label: "Total de ações corretivas", value: 0 },
      { label: "Registros com observação", value: recordsWithObservation },
      { label: "Total de dias assinados pelo supervisor", value: signedRecordDates.size },
      { label: "Total de dias pendentes de assinatura", value: pendingDailySignatures },
      {
        label: "Status do fechamento mensal",
        value: reopenedLabel ?? (monthlyClosure ? "Assinado digitalmente" : "Pendente de assinatura digital")
      },
      {
        label: "Responsável técnico no sistema",
        value: monthlyClosure?.usuarioNomeSnapshot ?? "-"
      },
      {
        label: "Data/hora da assinatura digital",
        value: monthlyClosure ? formatAppDateTime(monthlyClosure.assinadoEm) : "-"
      }
    ],
    columns: [
      { key: "data", label: "Data" },
      { key: "hortifruti", label: "Hortifruti" },
      { key: "produtoUtilizado", label: "Produto utilizado" },
      { key: "inicioProcesso", label: "Início do processo" },
      { key: "terminoProcesso", label: "Término do processo" },
      { key: "responsavel", label: "Responsável" },
      { key: "supervisor", label: "Supervisor" },
      { key: "observacoes", label: "Observações" }
    ],
    rows: records.map((record) => {
      const dateKey = formatAppDateInput(record.data);

      return {
        data: formatAppDate(record.data),
        hortifruti: record.hortifruti,
        produtoUtilizado: record.produtoUtilizado,
        inicioProcesso: record.inicioProcesso,
        terminoProcesso: record.terminoProcesso,
        responsavel: record.responsavel,
        supervisor: dailySignaturesByDate.get(dateKey) ?? "-",
        observacoes: record.observacoes
      };
    })
  };

  return new NextResponse(renderMonthlySanitaryReportDocument(report), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
