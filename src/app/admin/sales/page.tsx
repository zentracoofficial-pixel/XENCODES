import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
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

  const dataFrom = [lastMonth, from].sort()[0];
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
  const days: string[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);
  const byDay = new Map(dayRows.filter((r) => r.currency === currency).map((r) => [r.day, r]));
  const services = serviceRows.filter((r) => r.currency === currency);

  function currencyHref(code: string) {
    const q = new URLSearchParams();
    q.set("from", from);
    q.set("to", to);
    if (code !== defaultCurrency.code) q.set("currency", code);
    return `/admin/sales?${q.toString()}`;
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
      active
        ? "border-forest bg-forest text-white"
        : "border-border bg-surface text-muted-foreground hover:bg-background hover:text-foreground",
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales and profit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completed sales, what the provider billed for them and the profit left. Only orders whose code
          arrived count; refunded, cancelled and expired orders do not. Days are Nigerian days.
        </p>
      </div>

      {currencies.length > 1 ? (
        <nav aria-label="Currency" className="flex flex-wrap gap-2">
          {currencies.map((code) => (
            <Link key={code} href={currencyHref(code)} className={chip(code === currency)}>
              {code}
            </Link>
          ))}
        </nav>
      ) : null}

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">At a glance</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {periods.map((period) => (
            <Card key={period.label} className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{period.label}</p>
                <p className="truncate text-xs text-muted-foreground">{period.hint}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-success">
                {money(period.totals.profitMinor)}
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">profit</span>
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Sales</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{period.totals.sales}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{money(period.totals.revenueMinor)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Provider cost</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{money(period.totals.costMinor)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">{margin(period.totals)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Any dates</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick a start and end day to total those days, with the day by day figures below.
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            {currency !== defaultCurrency.code ? <input type="hidden" name="currency" value={currency} /> : null}
            <label className="text-xs font-medium text-muted-foreground">
              From
              <input
                type="date"
                name="from"
                defaultValue={from}
                max={today}
                className="mt-1 block h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              To
              <input
                type="date"
                name="to"
                defaultValue={to}
                max={today}
                className="mt-1 block h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-forest px-4 text-sm font-medium text-white transition-colors hover:bg-forest-dark"
            >
              Show
            </button>
          </form>
        </div>

        <Card className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
          {[
            { label: "Sales", value: String(rangeTotals.sales) },
            { label: "Revenue", value: money(rangeTotals.revenueMinor) },
            { label: "Provider cost", value: money(rangeTotals.costMinor) },
            { label: "Profit", value: money(rangeTotals.profitMinor), tone: "text-success" },
            { label: "Price vs cost", value: margin(rangeTotals) },
          ].map((cell) => (
            <div key={cell.label} className="px-4 py-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{cell.label}</p>
              <p className={cn("mt-1 font-semibold tabular-nums", cell.label === "Price vs cost" ? "text-sm" : "text-lg", cell.tone)}>{cell.value}</p>
            </div>
          ))}
        </Card>
        <p className="text-xs text-muted-foreground">
          {formatDay(from)} to {formatDay(to)}
        </p>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">Day by day</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Day</th>
                <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-4 py-2.5 text-right font-medium">Provider cost</th>
                <th className="px-4 py-2.5 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((day) => {
                const row = byDay.get(day);
                return (
                  <tr key={day} className={cn(!row && "text-muted-foreground")}>
                    <td className="px-4 py-2.5">{formatDay(day)}</td>
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
        </Card>
      </section>

      <section>
        <h2 className="mb-2.5 text-sm font-semibold">By service, same dates</h2>
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
