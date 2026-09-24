"use client";

import { useActionState, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveMarginSettingsAction,
  saveProviderSettingsAction,
  saveUsdRateAction,
  saveTopupFeeSettingsAction,
  type SettingsState,
} from "./actions";

const initial: SettingsState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export function MarginForm({
  defaultPercent,
  exclusivePercent,
}: {
  defaultPercent: number;
  exclusivePercent: number;
}) {
  const [state, formAction, pending] = useActionState(
    saveMarginSettingsAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="defaultMargin">
            Standard gross margin
          </label>
          <div className="flex items-center gap-2">
            <input
              id="defaultMargin"
              name="defaultMargin"
              type="number"
              step="1"
              min="0"
              max="95"
              defaultValue={defaultPercent}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="exclusiveMargin">
            Exclusive tier margin
          </label>
          <div className="flex items-center gap-2">
            <input
              id="exclusiveMargin"
              name="exclusiveMargin"
              type="number"
              step="1"
              min="0"
              max="95"
              defaultValue={exclusivePercent}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Gross margin is profit as a share of what the customer pays, not a
        markup on cost. At 50% the customer pays twice the provider cost. A
        50% markup would only be a 33% margin, which is why these are entered
        as margins everywhere.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save margins"}
      </Button>
    </form>
  );
}

const ADAPTER_LABEL: Record<string, string> = {
  grizzlysms: "GrizzlySMS",
};

export function ProviderForm({
  providerId,
  providerEnabled,
  availableAdapters,
  credentialsConfigured,
}: {
  providerId: string;
  providerEnabled: boolean;
  /** Adapter ids that actually have an integration behind them. */
  availableAdapters: string[];
  /** Whether the selected adapter's environment variable is actually set
   *  on this deployment. Only meaningful once a provider is selected. */
  credentialsConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveProviderSettingsAction,
    initial,
  );
  const [enabled, setEnabled] = useState(providerEnabled);

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <label className={labelClass} htmlFor="providerId">
          Provider
        </label>
        <select id="providerId" name="providerId" defaultValue={providerId} className={inputClass}>
          <option value="">Not selected</option>
          {availableAdapters.map((id) => (
            <option key={id} value={id}>
              {ADAPTER_LABEL[id] ?? id}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2.5 text-sm">
        <input
          name="providerEnabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-border accent-primary"
        />
        Connection enabled, so numbers are purchased live from this provider
      </label>

      {providerId && !credentialsConfigured ? (
        <div className="flex max-w-xl items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {ADAPTER_LABEL[providerId] ?? providerId} is selected but its API
            key is not set as an environment variable on this deployment.
            Numbers cannot be sold until{" "}
            <code className="rounded bg-surface px-1 py-0.5">
              {providerId.toUpperCase()}_API_KEY
            </code>{" "}
            is added there. Never type it into this form: it belongs only in
            environment configuration.
          </p>
        </div>
      ) : (
        <p className="max-w-xl text-xs text-muted-foreground">
          Credentials come from this deployment&apos;s environment variables,
          so there is no API key to type here and nothing here can display
          one.
        </p>
      )}

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save connection"}
      </Button>
    </form>
  );
}

export function TopupFeeForm({
  feePercent,
  feeFlatKobo,
}: {
  feePercent: number;
  feeFlatKobo: number;
}) {
  const [state, formAction, pending] = useActionState(saveTopupFeeSettingsAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="feePercent">
            Percentage fee
          </label>
          <div className="flex items-center gap-2">
            <input
              id="feePercent"
              name="feePercent"
              type="number"
              step="0.01"
              min="0"
              max="20"
              defaultValue={feePercent}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="feeFlatNaira">
            Flat fee
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">₦</span>
            <input
              id="feeFlatNaira"
              name="feeFlatNaira"
              type="number"
              step="1"
              min="0"
              defaultValue={feeFlatKobo / 100}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Added on top of every wallet top-up, so KoraPay&apos;s processing
        cost is paid by the customer rather than absorbed here. The wallet
        is still credited exactly the amount the customer asked for; only
        what they are charged at checkout includes this fee. Match this to
        what KoraPay actually charges this account, shown on your KoraPay
        dashboard. Both default to 0, so leaving this unset charges nothing
        extra.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save fee"}
      </Button>
    </form>
  );
}

/** Naira depreciates against the dollar over time; a rate typed in once and
 *  never revisited quietly understates real cost until margin erodes or
 *  disappears. This is the one piece of "cost" in the whole pricing chain
 *  that isn't live, so it is the one thing that needs a nag. */
const STALE_AFTER_DAYS = 7;

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function UsdRateForm({
  usdToNgnRate,
  usdToNgnRateUpdatedAt,
}: {
  usdToNgnRate: number;
  /** ISO timestamp of the last time an admin actually saved this rate, or
   *  null if it has never been set (still running on the code default). */
  usdToNgnRateUpdatedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveUsdRateAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <label className={labelClass} htmlFor="usdToNgnRate">
          Naira per US dollar
        </label>
        <input
          id="usdToNgnRate"
          name="usdToNgnRate"
          type="number"
          step="0.01"
          min="0"
          defaultValue={usdToNgnRate}
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground">
          GrizzlySMS prices in US dollars. This rate converts every cost to
          Naira before margin is applied, so keep it current.
        </p>
      </div>

      {usdToNgnRateUpdatedAt === null ? (
        <div className="flex max-w-xl items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This rate has never actually been set, it is still the code
            default above. Confirm today&apos;s rate and save it before
            trusting the prices customers see.
          </p>
        </div>
      ) : daysSince(usdToNgnRateUpdatedAt) >= STALE_AFTER_DAYS ? (
        <div className="flex max-w-xl items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Last updated {daysSince(usdToNgnRateUpdatedAt)} days ago. Every
            other number in this chain is live or admin-set on purpose; this
            rate is the one exception, and it is the whole reason a sale
            could quietly go below cost. Check today&apos;s rate and update
            it if the Naira has moved.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Updated {daysSince(usdToNgnRateUpdatedAt)}{" "}
          {daysSince(usdToNgnRateUpdatedAt) === 1 ? "day" : "days"} ago.
        </p>
      )}

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save rate"}
      </Button>
    </form>
  );
}
