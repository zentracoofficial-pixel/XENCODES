import { addDays, weekStartKey, type DayRow } from "@/lib/sales-report";
import type { ChartPoint } from "./profit-chart";

/** Longest range drawn one column per day; longer ranges use one per week. */
const MAX_DAILY_COLUMNS = 92;

function dayDate(key: string) {
  return new Date(`${key}T12:00:00Z`);
}

function short(key: string) {
  return dayDate(key).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });
}

function long(key: string) {
  return dayDate(key).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One chart column per day from `from` to `to` (oldest first), every day
 * present even with no sales, in one currency. Ranges longer than about three
 * months become one column per week so the chart stays readable.
 */
export function buildChartPoints(rows: DayRow[], currency: string, from: string, to: string): ChartPoint[] {
  const byDay = new Map(rows.filter((r) => r.currency === currency).map((r) => [r.day, r]));
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const weekly = days.length > MAX_DAILY_COLUMNS;
  const buckets = new Map<string, ChartPoint>();
  for (const day of days) {
    const bucketKey = weekly ? weekStartKey(day) : day;
    const row = byDay.get(day);
    const existing = buckets.get(bucketKey);
    const point: ChartPoint = existing ?? {
      key: bucketKey,
      label: weekly ? `Week of ${long(bucketKey < from ? from : bucketKey)}` : long(day),
      short: short(bucketKey < from ? from : bucketKey),
      revenueMinor: 0,
      costMinor: 0,
      profitMinor: 0,
      sales: 0,
    };
    if (row) {
      point.revenueMinor += row.revenueMinor;
      point.costMinor += row.costMinor;
      point.profitMinor += row.profitMinor;
      point.sales += row.sales;
    }
    buckets.set(bucketKey, point);
  }
  return Array.from(buckets.values());
}
