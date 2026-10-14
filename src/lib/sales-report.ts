import { prisma } from "@/lib/prisma";

/**
 * Sales, provider cost and profit over time, for the admin Sales page.
 *
 * A "sale" is an order that stood: status RECEIVED. An order still waiting,
 * or one that ended expired, cancelled or refunded, is not a sale (each of
 * those gives the customer's money back), the same rule the dashboard
 * totals use. Money is read from the figures stored on the order when it was
 * placed (price, supplier cost and profit in the buyer's currency), never
 * recomputed, and is kept per currency because two currencies never add up
 * to one figure.
 *
 * Days are Nigerian days (Africa/Lagos, UTC+1 all year, no daylight saving),
 * not the server's clock, so "today" on the report means today where the
 * business is. A sale belongs to the day its code arrived (receivedAt), or
 * the day it was ordered for the few old orders with no receipt time.
 */

export const REPORT_TIME_ZONE = "Africa/Lagos";
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SalesTotals {
  sales: number;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
}

export const EMPTY_TOTALS: SalesTotals = { sales: 0, revenueMinor: 0, costMinor: 0, profitMinor: 0 };

export function addTotals(a: SalesTotals, b: SalesTotals): SalesTotals {
  return {
    sales: a.sales + b.sales,
    revenueMinor: a.revenueMinor + b.revenueMinor,
    costMinor: a.costMinor + b.costMinor,
    profitMinor: a.profitMinor + b.profitMinor,
  };
}

/** "2026-10-14": today's date in Nigeria. */
export function lagosDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function keyToUtcMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

export function addDays(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The instant a Nigerian day begins. */
export function lagosDayStart(key: string): Date {
  return new Date(keyToUtcMs(key) - LAGOS_OFFSET_MS);
}

/** Monday of the week the given day falls in. */
export function weekStartKey(key: string): string {
  const dow = new Date(keyToUtcMs(key)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function previousMonthStartKey(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

export interface DayRow extends SalesTotals {
  day: string;
  currency: string;
}

interface RawDayRow {
  day: string;
  currency: string;
  sales: number;
  revenue: bigint | number;
  cost: bigint | number;
  profit: bigint | number;
}

/** Completed sales grouped by Nigerian day and currency, for [fromKey, toKey]. */
export async function getDailySales(fromKey: string, toKey: string): Promise<DayRow[]> {
  const from = lagosDayStart(fromKey);
  const to = lagosDayStart(addDays(toKey, 1));
  const rows = await prisma.$queryRaw<RawDayRow[]>`
    SELECT
      to_char((COALESCE("receivedAt", "createdAt") AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
      "currency" AS currency,
      COUNT(*)::int AS sales,
      COALESCE(SUM("priceKobo"), 0)::bigint AS revenue,
      COALESCE(SUM("providerCostKobo"), 0)::bigint AS cost,
      COALESCE(SUM("grossProfitKobo"), 0)::bigint AS profit
    FROM activations
    WHERE status = 'RECEIVED'
      AND COALESCE("receivedAt", "createdAt") >= ${from}
      AND COALESCE("receivedAt", "createdAt") < ${to}
    GROUP BY 1, 2
    ORDER BY 1 DESC
  `;
  return rows.map((row) => ({
    day: row.day,
    currency: row.currency,
    sales: Number(row.sales),
    revenueMinor: Number(row.revenue),
    costMinor: Number(row.cost),
    profitMinor: Number(row.profit),
  }));
}

export interface ServiceRow extends SalesTotals {
  serviceName: string;
  currency: string;
}

interface RawServiceRow {
  service: string;
  currency: string;
  sales: number;
  revenue: bigint | number;
  cost: bigint | number;
  profit: bigint | number;
}

/** Completed sales grouped by service and currency, for [fromKey, toKey]. */
export async function getSalesByService(fromKey: string, toKey: string): Promise<ServiceRow[]> {
  const from = lagosDayStart(fromKey);
  const to = lagosDayStart(addDays(toKey, 1));
  const rows = await prisma.$queryRaw<RawServiceRow[]>`
    SELECT
      "serviceName" AS service,
      "currency" AS currency,
      COUNT(*)::int AS sales,
      COALESCE(SUM("priceKobo"), 0)::bigint AS revenue,
      COALESCE(SUM("providerCostKobo"), 0)::bigint AS cost,
      COALESCE(SUM("grossProfitKobo"), 0)::bigint AS profit
    FROM activations
    WHERE status = 'RECEIVED'
      AND COALESCE("receivedAt", "createdAt") >= ${from}
      AND COALESCE("receivedAt", "createdAt") < ${to}
    GROUP BY 1, 2
    ORDER BY profit DESC
  `;
  return rows.map((row) => ({
    serviceName: row.service,
    currency: row.currency,
    sales: Number(row.sales),
    revenueMinor: Number(row.revenue),
    costMinor: Number(row.cost),
    profitMinor: Number(row.profit),
  }));
}

/** Adds up the day rows of one currency whose day falls in [fromKey, toKey]. */
export function sumDays(rows: DayRow[], currency: string, fromKey: string, toKey: string): SalesTotals {
  return rows
    .filter((row) => row.currency === currency && row.day >= fromKey && row.day <= toKey)
    .reduce<SalesTotals>((sum, row) => addTotals(sum, row), EMPTY_TOTALS);
}
