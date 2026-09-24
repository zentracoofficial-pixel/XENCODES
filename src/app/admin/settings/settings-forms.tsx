"use client";

import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveMarginSettingsAction,
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

export function TopupFeeForm({
  feePercent,
  feeCapKobo,
}: {
  feePercent: number;
  feeCapKobo: number;
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
          <label className={labelClass} htmlFor="feeCapNaira">
            Fee cap
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">₦</span>
            <input
              id="feeCapNaira"
              name="feeCapNaira"
              type="number"
              step="1"
              min="0"
              defaultValue={feeCapKobo / 100}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Added on top of every wallet top-up, so KoraPay&apos;s processing
        cost is paid by the customer rather than absorbed here. The wallet
        is still credited exactly the amount the customer asked for; only
        what they are charged at checkout includes this fee. Defaults to
        KoraPay&apos;s own published local rate (1.5%, capped at ₦2,000 per
        transaction) — only change this if KoraPay quotes this account a
        different negotiated rate.
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
          Used to convert any dollar-priced provider&apos;s cost (GrizzlySMS
          prices in US dollars) into Naira before margin is applied, so keep
          it current.
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
