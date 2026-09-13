"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveProviderSettingsAction, type ProviderSettingsState } from "./actions";

const initial: ProviderSettingsState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

/** Naira depreciates against the dollar over time; a rate typed in once and
 *  never revisited quietly understates real cost until margin erodes or
 *  disappears. This is the one piece of "cost" in the whole pricing chain
 *  that isn't live, so it is the one thing that needs a nag. */
const STALE_AFTER_DAYS = 7;

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function ProviderForm({
  providerName,
  providerBaseUrl,
  maskedApiKey,
  providerEnabled,
  usingSmsPool,
  usdToNgnRate,
  usdToNgnRateUpdatedAt,
}: {
  providerName: string;
  providerBaseUrl: string;
  maskedApiKey: string;
  providerEnabled: boolean;
  /** True when SMSPOOL_API_KEY is set as an environment variable. */
  usingSmsPool: boolean;
  usdToNgnRate: number;
  /** ISO timestamp of the last time an admin actually saved this rate, or
   *  null if it has never been set at all (still running on the code
   *  default, not a real rate anyone chose). */
  usdToNgnRateUpdatedAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveProviderSettingsAction, initial);
  const [enabled, setEnabled] = useState(providerEnabled);

  if (usingSmsPool) {
    return (
      <form action={formAction} className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-mint-soft px-3.5 py-3 text-sm text-forest">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            SMSPool is configured, using the API key set as{" "}
            <code className="rounded bg-surface px-1 py-0.5">SMSPOOL_API_KEY</code> in
            this deployment&apos;s environment. There is nothing to type here for the
            connection itself.
          </p>
        </div>

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
            SMSPool prices in US dollars. This rate converts every price to Naira
            before markup, so keep it current.
          </p>
        </div>

        {usdToNgnRateUpdatedAt === null ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This rate has never actually been set, it&apos;s still the code
              default above. That&apos;s not a real exchange rate: confirm today&apos;s
              rate and save it before trusting the prices customers see.
            </p>
          </div>
        ) : daysSince(usdToNgnRateUpdatedAt) >= STALE_AFTER_DAYS ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Last updated {daysSince(usdToNgnRateUpdatedAt)} days ago. Every
              other number in this chain (SMSPool&apos;s price, your markup) is
              live or admin-set on purpose; this rate is the one exception,
              and it&apos;s the whole reason a sale could quietly go below cost.
              Check today&apos;s rate and update it if the Naira has moved.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Updated {daysSince(usdToNgnRateUpdatedAt)}{" "}
            {daysSince(usdToNgnRateUpdatedAt) === 1 ? "day" : "days"} ago.
          </p>
        )}

        <label className="flex items-center gap-2.5 text-sm">
          <input
            name="providerEnabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-border accent-primary"
          />
          Connection enabled, so numbers are purchased live from SMSPool
        </label>

        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-success">Saved.</p> : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="providerName">
            Provider name
          </label>
          <input
            id="providerName"
            name="providerName"
            type="text"
            defaultValue={providerName}
            placeholder="e.g. 5sim, SMS-Activate"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="providerBaseUrl">
            API base URL
          </label>
          <input
            id="providerBaseUrl"
            name="providerBaseUrl"
            type="text"
            defaultValue={providerBaseUrl}
            placeholder="https://api.provider.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="providerApiKey">
          API key
        </label>
        <input
          id="providerApiKey"
          name="providerApiKey"
          type="password"
          placeholder={maskedApiKey || "Not set"}
          className={inputClass}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          {maskedApiKey ? `Currently set: ${maskedApiKey}. ` : ""}Leave blank to keep the stored key.
        </p>
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

      <p className="text-xs text-muted-foreground">
        To use SMSPool instead, set{" "}
        <code className="rounded bg-background px-1 py-0.5">SMSPOOL_API_KEY</code> as an
        environment variable on this deployment. This form is for a different
        provider that speaks plain HTTP.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save connection"}
      </Button>
    </form>
  );
}
