"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  saveMarginSettingsAction,
  saveProviderSettingsAction,
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

export function ProviderForm({
  providerId,
  providerBaseUrl,
  providerEnabled,
  availableAdapters,
}: {
  providerId: string;
  providerBaseUrl: string;
  providerEnabled: boolean;
  /** Adapter ids that actually have an integration behind them. */
  availableAdapters: string[];
}) {
  const [state, formAction, pending] = useActionState(
    saveProviderSettingsAction,
    initial,
  );
  const [enabled, setEnabled] = useState(providerEnabled);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="providerId">
            Provider
          </label>
          <input
            id="providerId"
            name="providerId"
            type="text"
            defaultValue={providerId}
            placeholder="Not selected"
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

      {availableAdapters.length === 0 ? (
        <p className="max-w-xl rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          No provider integration is built yet, so switching this on will not
          put numbers on sale. Selecting a provider here records the choice;
          the integration itself is a code change, and its API key belongs in
          this deployment&apos;s environment variables, never in this form.
        </p>
      ) : (
        <p className="max-w-xl text-xs text-muted-foreground">
          Integrations available: {availableAdapters.join(", ")}. Credentials
          come from this deployment&apos;s environment variables, so there is
          no API key to type here.
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
