export type MonthlySanitaryReportColumn = {
  key: string;
  label: string;
};

export type MonthlySanitaryReportRow = Record<string, string | number | null | undefined>;

export type MonthlySanitaryReportSummaryItem = {
  label: string;
  value: string | number;
};

export type MonthlySanitaryReport = {
  title: string;
  reportName: string;
  annexCode: string;
  revision: string;
  elaborationDate: string;
  referenceMonthYear: string;
  unitName: string;
  moduleName: string;
  brandName: string;
  emittedAt: string;
  generatedAtSentence: string;
  footerResponsibleName?: string | null;
  footerDate: string;
  summaryItems: MonthlySanitaryReportSummaryItem[];
  columns: MonthlySanitaryReportColumn[];
  rows: MonthlySanitaryReportRow[];
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function displayValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function chunkSummaryItems(
  items: MonthlySanitaryReportSummaryItem[]
): MonthlySanitaryReportSummaryItem[][] {
  const rows: MonthlySanitaryReportSummaryItem[][] = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2));
  }

  return rows;
}

function renderSummaryTable(items: MonthlySanitaryReportSummaryItem[]): string {
  const rows = chunkSummaryItems(items).map((row) => {
    const [first, second] = row;

    return `
      <tr>
        <th>${escapeHtml(first.label)}</th>
        <td>${escapeHtml(first.value)}</td>
        ${
          second
            ? `<th>${escapeHtml(second.label)}</th><td>${escapeHtml(second.value)}</td>`
            : '<th class="empty-cell"></th><td class="empty-cell"></td>'
        }
      </tr>`;
  });

  return `
    <section class="report-section">
      <h2>Resumo do fechamento mensal</h2>
      <table class="summary-table">
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
    </section>`;
}

function renderDataTable(report: MonthlySanitaryReport): string {
  const headers = report.columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const rows =
    report.rows.length > 0
      ? report.rows
          .map(
            (row) => `
              <tr>
                ${report.columns
                  .map((column) => `<td>${escapeHtml(displayValue(row[column.key]))}</td>`)
                  .join("")}
              </tr>`
          )
          .join("")
      : `
        <tr>
          <td colspan="${report.columns.length}" class="empty-message">
            Nenhum registro encontrado para o mês de referência.
          </td>
        </tr>`;

  return `
    <section class="report-section">
      <h2>Registros do mês</h2>
      <table class="records-table">
        <thead>
          <tr>${headers}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderHeader(report: MonthlySanitaryReport): string {
  return `
    <header>
      <table class="header-table">
        <tbody>
          <tr>
            <td class="brand-cell" rowspan="4">
              <strong>${escapeHtml(report.brandName)}</strong>
              <span>Controle sanitário</span>
            </td>
            <td class="title-cell" colspan="4">${escapeHtml(report.title)}</td>
          </tr>
          <tr>
            <th>Relatório</th>
            <td>${escapeHtml(report.reportName)}</td>
            <th>Anexo</th>
            <td>${escapeHtml(report.annexCode)}</td>
          </tr>
          <tr>
            <th>Data da elaboração</th>
            <td>${escapeHtml(report.elaborationDate)}</td>
            <th>Emissão</th>
            <td>${escapeHtml(report.emittedAt)}</td>
          </tr>
          <tr>
            <th>Mês/Ano</th>
            <td>${escapeHtml(report.referenceMonthYear)}</td>
            <th>Unidade</th>
            <td>${escapeHtml(report.unitName)}</td>
          </tr>
        </tbody>
      </table>
      <p class="module-line"><strong>Módulo:</strong> ${escapeHtml(report.moduleName)}</p>
    </header>`;
}

function renderFooter(report: MonthlySanitaryReport): string {
  const responsibleName =
    report.footerResponsibleName?.trim() || "______________________________";

  return `
    <footer>
      <table class="manual-signature-table">
        <tbody>
          <tr>
            <th>Responsável Técnico ou Nutricionista:</th>
            <td>${escapeHtml(responsibleName)}</td>
            <th>Data:</th>
            <td>${escapeHtml(report.footerDate)}</td>
          </tr>
        </tbody>
      </table>
    </footer>`;
}

function renderStyles(): string {
  return `
    <style>
      @page {
        size: A4 landscape;
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
        font-size: 11px;
        line-height: 1.35;
      }

      body {
        padding: 16px;
      }

      .report-page {
        max-width: 1180px;
        margin: 0 auto;
        background: #ffffff;
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
        font-weight: 700;
        background: #f2f2f2;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      .header-table {
        table-layout: fixed;
      }

      .brand-cell {
        width: 18%;
        text-align: center;
        vertical-align: middle;
        font-size: 14px;
      }

      .brand-cell span {
        display: block;
        margin-top: 4px;
        font-size: 10px;
        font-weight: 400;
      }

      .title-cell {
        text-align: center;
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0;
      }

      .module-line {
        margin-top: 6px;
      }

      .report-section {
        margin-top: 10px;
        break-inside: avoid;
      }

      .report-section h2 {
        border: 1px solid #000000;
        border-bottom: 0;
        background: #f2f2f2;
        padding: 5px 6px;
        font-size: 11px;
        text-transform: uppercase;
      }

      .summary-table th {
        width: 22%;
      }

      .summary-table td {
        width: 28%;
      }

      .empty-cell {
        background: #ffffff;
      }

      .records-table {
        table-layout: fixed;
      }

      .records-table th:nth-child(1),
      .records-table td:nth-child(1) {
        width: 8%;
      }

      .records-table th:nth-child(2),
      .records-table td:nth-child(2) {
        width: 16%;
      }

      .records-table th:nth-child(3),
      .records-table td:nth-child(3) {
        width: 16%;
      }

      .records-table th:nth-child(4),
      .records-table td:nth-child(4),
      .records-table th:nth-child(5),
      .records-table td:nth-child(5) {
        width: 10%;
      }

      .records-table th:nth-child(6),
      .records-table td:nth-child(6) {
        width: 15%;
      }

      .records-table th:nth-child(7),
      .records-table td:nth-child(7) {
        width: 15%;
      }

      .records-table th:nth-child(8),
      .records-table td:nth-child(8) {
        width: 20%;
      }

      .empty-message {
        height: 28px;
        text-align: center;
      }

      footer {
        margin-top: 14px;
        break-inside: avoid;
      }

      .manual-signature-table {
        table-layout: fixed;
      }

      .manual-signature-table th {
        vertical-align: middle;
      }

      .manual-signature-table td {
        height: 28px;
        vertical-align: middle;
        white-space: nowrap;
      }

      .manual-signature-table tr > th:first-child {
        width: 30%;
      }

      .manual-signature-table tr > td:nth-child(2) {
        width: 40%;
      }

      .manual-signature-table tr > th:nth-child(3) {
        width: 8%;
      }

      .manual-signature-table tr > td:nth-child(4) {
        width: 22%;
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

      @media print {
        .screen-actions {
          display: none;
        }

        body {
          padding: 0;
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

export function renderMonthlySanitaryReportDocument(
  report: MonthlySanitaryReport
): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.title)} - ${escapeHtml(report.referenceMonthYear)}</title>
    ${renderStyles()}
  </head>
  <body>
    <main class="report-page">
      <div class="screen-actions">
        <button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
      </div>
      ${renderHeader(report)}
      ${renderSummaryTable(report.summaryItems)}
      ${renderDataTable(report)}
      ${renderFooter(report)}
    </main>
  </body>
</html>`;
}
