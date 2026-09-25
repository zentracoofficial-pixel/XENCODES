"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  saveMarginSettingsAction,
  saveTopupFeeSettingsAction,
  sendTestEmailAction,
  type SettingsState,
  type TestEmailState,
} from "./actions";

const initial: SettingsState = {};
const initialTestEmail: TestEmailState = {};

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

export function TopupFeeForm({ feePercent }: { feePercent: number }) {
  const [state, formAction, pending] = useActionState(saveTopupFeeSettingsAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-xs space-y-1.5">
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

      <p className="max-w-xl text-xs text-muted-foreground">
        Added on top of every wallet top-up, so KoraPay&apos;s processing
        cost is paid by the customer rather than absorbed here. The wallet
        is still credited exactly the amount the customer asked for; only
        what they are charged at checkout includes this fee. Defaults to
        KoraPay&apos;s own published rate (1.5%) — only change this if
        KoraPay quotes this account a different negotiated rate. The cap on
        this fee is set per currency on Currencies, since a sensible cap
        varies by currency the way the percentage does not.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save fee"}
      </Button>
    </form>
  );
}

/**
 * A real send-to-yourself button, not a status check: the surest way to
 * know whether outbound email actually works on this exact deployment right
 * now is to try it and read back what actually happened, including
 * Resend's own error text verbatim if it fails.
 */
export function TestEmailButton() {
  const [state, formAction, pending] = useActionState(sendTestEmailAction, initialTestEmail);

  return (
    <form action={formAction} className="space-y-3">
      <Button type="submit" disabled={pending} variant="outline" size="sm">
        {pending ? "Sending..." : "Send test email to myself"}
      </Button>

      {state.status === "sent" ? (
        <p className="text-sm text-success">{state.message}</p>
      ) : null}
      {state.status === "error" ? (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
