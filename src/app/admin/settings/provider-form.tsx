"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveProviderSettingsAction, type ProviderSettingsState } from "./actions";

const initial: ProviderSettingsState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export function ProviderForm({
  providerName,
  providerBaseUrl,
  maskedApiKey,
  providerEnabled,
}: {
  providerName: string;
  providerBaseUrl: string;
  maskedApiKey: string;
  providerEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProviderSettingsAction, initial);
  const [enabled, setEnabled] = useState(providerEnabled);

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
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Connection enabled, so numbers are purchased live from this provider
      </label>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save connection"}
      </Button>
    </form>
  );
}
