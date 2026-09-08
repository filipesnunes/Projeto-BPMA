import { getAppMonthDateRange } from "./date-time";

export function parseFilterMonth(value: string): number | null {
  const month = Number(value);
  return value.trim() && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

export function parseFilterYear(value: string): number | null {
  const year = Number(value);
  return value.trim() && Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null;
}

// Only two dates are fetched from the database. Each range uses the existing date
// index; records are filtered by Prisma before ordering/pagination, never in memory.
export function getMonthRangesForBounds(
  month: number,
  first: Date | null,
  last: Date | null
): { start: Date; end: Date }[] {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !first || !last) return [];
  const ranges: { start: Date; end: Date }[] = [];
  for (let year = first.getUTCFullYear(); year <= last.getUTCFullYear(); year++) {
    const range = getAppMonthDateRange(month, year);
    const nextMonth = new Date(Date.UTC(year, month, 1));
    if (nextMonth > first && range.start <= last) ranges.push(range);
  }
  return ranges;
}
