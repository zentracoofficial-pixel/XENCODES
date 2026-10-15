import type { Metadata } from "next";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProfitChart, PROFIT_COLOR } from "./profit-chart";
import { buildChartPoints } from "./chart-data";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { formatMoney } from "@/lib/currency";
import { getDefaultCurrency } from "@/lib/currency-config";
import { realisedMargin } from "@/lib/pricing";
import {
  addDays,
  getDailySales,
  getSalesByService,
  isDateKey,
  lagosDateKey,
  monthStartKey,
  previousMonthStartKey,
  sumDays,
  weekStartKey,
  type SalesTotals,
} from "@/lib/sales-report";

export const metadata: Metadata = { title: "Admin: Sales and profit" };

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;

function formatDay(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The price as a multiple of the provider's cost, with the margin percent
 *  beside it for reference: "2.9x cost, 65.5% margin". */
function margin(totals: SalesTotals) {
  if (totals.revenueMinor <= 0) return "none";
  const percent = `${realisedMargin(totals.revenueMinor, totals.costMinor)}% margin`;
  return totals.costMinor > 0
    ? `${Number((totals.revenueMinor / totals.costMinor).toFixed(2))}x cost, ${percent}`
    : percent;
}

/**
 * Completed sales, what the supplier billed for them and the profit left, by
 * day, week and month, so profit can be tracked without a spreadsheet. A
 * sale is an order whose code arrived; refunded, cancelled and expired
 * orders are not counted (see src/lib/sales-report.ts).
 */
export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; currency?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const defaultCurrency = await getDefaultCurrency();

  const today = lagosDateKey();
  const thisWeek = weekStartKey(today);
  const lastWeek = weekStartKey(addDays(thisWeek, -1));
  const thisMonth = monthStartKey(today);
  const lastMonth = previousMonthStartKey(today);

  // The custom range, clamped so a typo cannot ask for years of rows.
  let to = isDateKey(params.to) ? params.to : today;
  if (to > today) to = today;
  let from = isDateKey(params.from) ? params.from : addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) from = to;
  if (from < addDays(to, -(MAX_RANGE_DAYS - 1))) from = addDays(to, -(MAX_RANGE_DAYS - 1));

  // The equally long stretch just before the chosen dates, for the change
  // shown beside the headline profit.
  const rangeDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(from, -rangeDays);

  const dataFrom = [lastMonth, prevFrom].sort()[0];
  const [dayRows, serviceRows] = await Promise.all([
    getDailySales(dataFrom, today),
    getSalesByService(from, to),
  ]);

  const currencies = Array.from(new Set([...dayRows.map((r) => r.currency), defaultCurrency.code]));
  const currency = currencies.includes(params.currency ?? "") ? (params.currency as string) : defaultCurrency.code;
  const money = (minor: number) => formatMoney(minor, currency);

  const periods: { label: string; hint: string; totals: SalesTotals }[] = [
    { label: "Today", hint: formatDay(today), totals: sumDays(dayRows, currency, today, today) },
    {
      label: "Yesterday",
      hint: formatDay(addDays(today, -1)),
      totals: sumDays(dayRows, currency, addDays(today, -1), addDays(today, -1)),
    },
    { label: "This week", hint: `From ${formatDay(thisWeek)}`, totals: sumDays(dayRows, currency, thisWeek, today) },
    {
      label: "Last week",
      hint: `${formatDay(lastWeek)} to ${formatDay(addDays(thisWeek, -1))}`,
      totals: sumDays(dayRows, currency, lastWeek, addDays(thisWeek, -1)),
    },
    { label: "This month", hint: `From ${formatDay(thisMonth)}`, totals: sumDays(dayRows, currency, thisMonth, today) },
    {
      label: "Last month",
      hint: `${formatDay(lastMonth)} to ${formatDay(addDays(thisMonth, -1))}`,
      totals: sumDays(dayRows, currency, lastMonth, addDays(thisMonth, -1)),
    },
  ];

  const rangeTotals = sumDays(dayRows, currency, from, to);
  const prevTotals = sumDays(dayRows, currency, prevFrom, prevTo);
  const days: string[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);
  const byDay = new Map(dayRows.filter((r) => r.currency === currency).map((r) => [r.day, r]));
  const services = serviceRows.filter((r) => r.currency === currency);
  const points = buildChartPoints(dayRows, currency, from, to);
  const weekly = points.length < days.length;

  // Ready-made date ranges, the ones reached for most.
  const presets = [
    { label: "7 days", from: addDays(today, -6), to: today },
    { label: "30 days", from: addDays(today, -29), to: today },
    { label: "90 days", from: addDays(today, -89), to: today },
    { label: "This month", from: thisMonth, to: today },
    { label: "Last month", from: lastMonth, to: addDays(thisMonth, -1) },
  ];
  const activePreset = presets.find((p) => p.from === from && p.to === to);
  const rangeLabel = activePreset
    ? activePreset.label.endsWith("days")
      ? `Last ${activePreset.label}`
      : activePreset.label
    : `${formatDay(from)} to ${formatDay(to)}`;

  function rangeHref(range: { from: string; to: string }, code: string = currency) {
    const q = new URLSearchParams();
    q.set("from", range.from);
    q.set("to", range.to);
    if (code !== defaultCurrency.code) q.set("currency", code);
    return `/admin/sales?${q.toString()}`;
  }

  const change = percentChange(rangeTotals.profitMinor, prevTotals.profitMinor);
  const topServices = services.slice().sort((a, b) => b.profitMinor - a.profitMinor);
  const shownServices = topServices.slice(0, 8);
  const otherServices = topServices.slice(8);
  const maxServiceProfit = Math.max(1, ...shownServices.map((r) => r.profitMinor));

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
      active
        ? "border-forest bg-forest text-white"
        : "border-border bg-surface text-muted-foreground hover:border-mint hover:text-foreground",
    );

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest/70">Sales</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Sales and profit</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Completed sales, what the provider billed for them and the profit left. Only orders whose code
          arrived count; refunded, cancelled and expired orders do not. Days are Nigerian days.
        </p>
      </div>

      {/* One row of filters; everything below follows them. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-border bg-surface p-3 sm:p-4">
        <nav aria-label="Date range" className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Link key={preset.label} href={rangeHref(preset)} className={chip(activePreset?.label === preset.label)}>
              {preset.label}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2 sm:ml-auto">
          {currency !== defaultCurrency.code ? <input type="hidden" name="currency" value={currency} /> : null}
          <label className="text-xs font-medium text-muted-foreground">
            From
            <input
              type="date"
              name="from"
              defaultValue={from}
              max={today}
              className="mt-1 block h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              name="to"
              defaultValue={to}
              max={today}
              className="mt-1 block h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-lg bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest-dark"
          >
            Show
          </button>
        </form>
        {currencies.length > 1 ? (
          <nav aria-label="Currency" className="flex w-full flex-wrap gap-2 border-t border-border pt-3">
            {currencies.map((code) => (
              <Link key={code} href={rangeHref({ from, to }, code)} className={chip(code === currency)}>
                {code}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-6 border-b border-border p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Profit, {rangeLabel.charAt(0).toLowerCase() + rangeLabel.slice(1)}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{money(rangeTotals.profitMinor)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
              {change === null ? (
                <span className="text-muted-foreground">No sales in the {rangeDays} days before to compare with.</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold",
                      change > 0 ? "bg-success-soft text-success" : change < 0 ? "bg-danger-soft text-danger" : "bg-background text-muted-foreground",
                    )}
                  >
                    {change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : change < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                    {change > 0 ? "+" : ""}
                    {change}%
                  </span>
                  <span className="text-muted-foreground">
                    vs the {rangeDays} {rangeDays === 1 ? "day" : "days"} before ({money(prevTotals.profitMinor)})
                  </span>
                </>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {[
              { label: "Revenue", value: money(rangeTotals.revenueMinor) },
              { label: "Provider cost", value: money(rangeTotals.costMinor) },
              { label: "Sales", value: rangeTotals.sales.toLocaleString("en-NG") },
              { label: "Price vs cost", value: marginShort(rangeTotals) },
            ].map((cell) => (
              <div key={cell.label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{cell.label}</dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight">{cell.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{weekly ? "Week by week" : "Day by day"}</h2>
            <p className="text-xs text-muted-foreground">
              {formatDay(from)} to {formatDay(to)} · amounts in {currency}
            </p>
          </div>
          <ProfitChart points={points} currency={currency} height={260} />
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold">At a glance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {periods.map((period) => (
            <div key={period.label} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{period.label}</p>
                <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{period.hint}</p>
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{money(period.totals.profitMinor)}</p>
              <p className="text-xs text-muted-foreground">profit</p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2.5 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold tabular-nums text-foreground">{period.totals.sales}</span> sales
                </span>
                <span>
                  <span className="font-semibold tabular-nums text-foreground">{money(period.totals.revenueMinor)}</span> revenue
                </span>
                <span className="w-full">{margin(period.totals)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Profit by service</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{rangeLabel}, most profitable first.</p>
          </div>
          {shownServices.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No completed sales in these dates.</p>
          ) : (
            <ul className="space-y-3.5">
              {shownServices.map((row) => (
                <li key={row.serviceName} title={`${row.serviceName}: ${row.sales} sales, ${money(row.revenueMinor)} revenue, ${money(row.costMinor)} provider cost, ${money(row.profitMinor)} profit`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{row.serviceName}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{money(row.profitMinor)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-mint-soft">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, (Math.max(0, row.profitMinor) / maxServiceProfit) * 100)}%`, background: PROFIT_COLOR }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {row.sales} {row.sales === 1 ? "sale" : "sales"}
                    </span>
                  </div>
                </li>
              ))}
              {otherServices.length > 0 ? (
                <li className="pt-1 text-xs text-muted-foreground">
                  And {otherServices.length} more {otherServices.length === 1 ? "service" : "services"} in the table below.
                </li>
              ) : null}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Every day</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">The exact figures behind the chart, newest first.</p>
          </div>
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="sticky top-0 z-[1]">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Day</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {days.map((day) => {
                  const row = byDay.get(day);
                  return (
                    <tr key={day} className={cn(!row && "text-muted-foreground")}>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDay(day)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row?.sales ?? 0}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row?.revenueMinor ?? 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row?.costMinor ?? 0)}</td>
                      <td className={cn("px-4 py-2.5 text-right font-medium tabular-nums", row && "text-success")}>
                        {money(row?.profitMinor ?? 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">By service, same dates</h2>
        <Card className="overflow-x-auto">
          {services.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No completed sales in these dates.</p>
          ) : (
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Service</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                  <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Provider cost</th>
                  <th className="px-4 py-2.5 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {services.map((row) => (
                  <tr key={row.serviceName}>
                    <td className="px-4 py-2.5 font-medium">{row.serviceName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.sales}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.revenueMinor)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.costMinor)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-success">
                      {money(row.profitMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}

/** Whole-percent change from `before` to `now`, or null when there is
 *  nothing before to compare with. */
function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** "2.9x cost" for the summary row. */
function marginShort(totals: SalesTotals) {
  if (totals.revenueMinor <= 0) return "none";
  return totals.costMinor > 0
    ? `${Number((totals.revenueMinor / totals.costMinor).toFixed(2))}x cost`
    : `${realisedMargin(totals.revenueMinor, totals.costMinor)}% margin`;
}
