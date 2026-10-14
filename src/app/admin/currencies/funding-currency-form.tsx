"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveFundingCurrencyAction, type FundingCurrencyFormState } from "./actions";

const initial: FundingCurrencyFormState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export function FundingCurrencyForm({
  code,
  values,
}: {
  code: string;
  values: {
    enabled: boolean;
    usdRate: number | null;
    followMarket: boolean;
    minAmount: number;
    maxAmount: number;
  };
}) {
  const [state, formAction, pending] = useActionState(saveFundingCurrencyAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="code" value={code} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`fx-rate-${code}`}>
            {code} per 1 USD
          </label>
          <input
            id={`fx-rate-${code}`}
            name="usdRate"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={values.usdRate ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`fx-min-${code}`}>
            Min top up ({code})
          </label>
          <input
            id={`fx-min-${code}`}
            name="minAmount"
            type="number"
            step="any"
            min="0"
            defaultValue={values.minAmount}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`fx-max-${code}`}>
            Max top up ({code})
          </label>
          <input
            id={`fx-max-${code}`}
            name="maxAmount"
            type="number"
            step="any"
            min="0"
            defaultValue={values.maxAmount}
            required
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="followMarket"
          defaultChecked={values.followMarket}
          className="mt-0.5 h-4 w-4 accent-[var(--forest)]"
        />
        <span>
          <span className="font-medium">Follow the market rate.</span> Use the daily market rate instead of the
          number above, so it never goes stale. If the market rate is more than 3 days old, {code} payments pause
          until it refreshes.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmed" className="mt-0.5 h-4 w-4 accent-[var(--forest)]" />
        <span>
          I have confirmed {code} payments are enabled on our KoraPay account (required to switch on).
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={values.enabled}
          className="h-4 w-4 accent-[var(--forest)]"
        />
        Offer {code} funding to customers
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-success">Saved.</p> : null}
      </div>
    </form>
  );
}
