"use client";

import { useActionState } from "react";
import { Route } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import type { SmartPickupSettings, ProviderPerformance } from "@/lib/smart-pickup";
import { saveSmartPickupAction, type ProviderActionResult } from "./actions";

interface Props {
  settings: SmartPickupSettings;
  providers: Array<{ id: string; label: string }>;
  performance: Array<ProviderPerformance & { label: string }>;
  ambiguous: Array<{
    id: string;
    providerLabel: string;
    serviceSlug: string;
    countrySlug: string;
    detail: string | null;
    createdAt: string;
  }>;
}

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
const secs = (value: number | null) =>
  value === null ? "—" : value < 90 ? `${Math.round(value)}s` : `${Math.round(value / 60)} min`;

/**
 * Smart Pickup: what each provider actually did, and how the next order is
 * routed between them. Admin only; nothing here reaches a customer.
 */
export function SmartPickupCard({ settings, providers, performance, ambiguous }: Props) {
  const [state, action, pending] = useActionState<ProviderActionResult | null, FormData>(saveSmartPickupAction, null);
  const field =
    "h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm tabular-nums outline-none focus:border-mint focus:ring-2 focus:ring-mint/25";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
          <Route className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Smart Pickup</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each server is priced its own way: Server I by the platform price rules, Server II at 4&times; its
            own cost. The cheapest server is asked first and the next only when it cannot sell; a dearer server
            is never used without the customer confirming its price. Between servers at the same price, the order
            goes to the one most likely to deliver a code, judged from Xencodes&apos; own finished orders for that
            exact service and country. A customer whose Server I order ends without a code is offered Server II.
          </p>
        </div>
        <Badge variant={settings.enabled ? "success" : "neutral"} className="ml-auto shrink-0">
          {settings.enabled ? "On" : "Off"}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-background text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-5 py-2.5">Last {settings.windowDays} days</th>
              <th className="px-3 py-2.5 text-right">Orders</th>
              <th className="px-3 py-2.5 text-right">Code delivered</th>
              <th className="px-3 py-2.5 text-right">Avg. time to code</th>
              <th className="px-3 py-2.5 text-right">No code / refunded</th>
              <th className="px-3 py-2.5 text-right">Purchase requests</th>
              <th className="px-3 py-2.5 text-right">Number handed over</th>
              <th className="px-3 py-2.5 text-right">Errors / timeouts</th>
              <th className="px-3 py-2.5 text-right">Avg. response</th>
              <th className="px-3 py-2.5 text-right">First choice / fallback</th>
              <th className="px-5 py-2.5 text-right">Provider cost (NGN orders)</th>
            </tr>
          </thead>
          <tbody>
            {performance.map((row) => (
              <tr key={row.providerId} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">{row.label}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.orders}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {pct(row.completionPercent)}
                  <span className="block text-xs text-muted-foreground">{row.delivered} delivered</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{secs(row.avgSecondsToCode)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.refunds}
                  <span className="block text-xs text-muted-foreground">{row.customerCancels} cancelled by customer</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{row.attempts}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {pct(row.purchaseSuccessPercent)}
                  <span className="block text-xs text-muted-foreground">{row.outOfStock} empty, {row.rejected} refused</span>
                </td>
                <td className={`px-3 py-3 text-right tabular-nums ${row.failures > 0 ? "text-danger" : ""}`}>{row.failures}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.avgLatencyMs === null ? "—" : `${(row.avgLatencyMs / 1000).toFixed(1)}s`}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {row.firstChoiceSales} / {row.fallbackSales}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{formatMoney(row.providerCostKobo, "NGN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
        Code delivered counts finished orders only; orders a customer cancelled are shown but not counted against a
        server. Every figure comes from real orders and purchase requests; a dash means there is no data yet.
      </p>

      {ambiguous.length > 0 ? (
        <div className="border-t border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-danger">Purchases to review ({ambiguous.length})</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A request that timed out or failed after it was sent may have bought a number at the server. The customer
            was not charged and no second number was bought. Check each one in that server&apos;s own dashboard.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {ambiguous.map((row) => (
              <li key={row.id} className="rounded-lg bg-background px-3 py-2">
                <span className="font-medium">{row.providerLabel}</span> · {row.serviceSlug} / {row.countrySlug} ·{" "}
                {new Date(row.createdAt).toLocaleString("en-NG")}
                {row.detail ? <span className="block text-muted-foreground">{row.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form action={action} className="border-t border-border px-5 py-4">
        <h3 className="text-sm font-semibold">Settings</h3>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4 accent-[var(--forest)]" />
            Smart Pickup on (off: cheapest server first)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="fallback" defaultChecked={settings.fallback} className="h-4 w-4 accent-[var(--forest)]" />
            Fall back to the next server when one cannot sell
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Evidence window (days)" name="windowDays" value={settings.windowDays} className={field} />
          <Num label="Orders before a pair's record is trusted" name="minSample" value={settings.minSample} className={field} />
          <Num label="Weight of the wider record (orders)" name="priorStrength" value={settings.priorStrength} className={field} />
          <Num label="Caution for small samples (0–3)" name="riskAversion" value={settings.riskAversion} step="0.1" className={field} />
          <Num label="Weight: delivery %" name="wSuccess" value={Math.round(settings.weights.success * 100)} className={field} />
          <Num label="Weight: number availability %" name="wAvailability" value={Math.round(settings.weights.availability * 100)} className={field} />
          <Num label="Weight: speed %" name="wSpeed" value={Math.round(settings.weights.speed * 100)} className={field} />
          <Num label="Weight: margin %" name="wCost" value={Math.round(settings.weights.cost * 100)} className={field} />
          <label className="block text-xs text-muted-foreground">
            Default server while there is too little data
            <select name="defaultProvider" defaultValue={settings.defaultProvider} className={`mt-1 ${field}`}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Num label="Share sent to another server to learn (%)" name="explorationPercent" value={settings.explorationPercent} className={field} />
          <Num label="Health window (hours)" name="healthWindowHours" value={settings.health.windowHours} className={field} />
          <Num label="Set aside after this many requests…" name="healthMinAttempts" value={settings.health.minAttempts} className={field} />
          <Num label="…if this % of them failed" name="healthMaxFailurePercent" value={settings.health.maxFailurePercent} className={field} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving" : "Save Smart Pickup"}
          </Button>
          {state?.ok ? <span className="text-xs text-success">Saved.</span> : null}
          {state?.error ? <span className="text-xs text-danger">{state.error}</span> : null}
        </div>
      </form>
    </Card>
  );
}

function Num({ label, name, value, step = "1", className }: { label: string; name: string; value: number; step?: string; className: string }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input type="number" name={name} defaultValue={value} step={step} min={0} className={`mt-1 ${className}`} />
    </label>
  );
}
