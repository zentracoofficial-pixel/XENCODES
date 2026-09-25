"use client";

import { useActionState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  saveCurrencyAction,
  toggleCurrencyEnabledAction,
  removeCurrencyAction,
  type CurrencyFormState,
} from "./actions";

const initial: CurrencyFormState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export interface CurrencyFormValues {
  code: string;
  enabled: boolean;
  usdRate: number;
  minTopUp: number;
  maxTopUp: number;
  feeCap: number;
  priority: number;
  countryLabel: string;
}

/**
 * One form, two jobs: adding a new currency (existing=null, code editable)
 * and editing one already configured (code fixed, since it is the entry's
 * own identity). Both submit to the same saveCurrencyAction, which upserts
 * by code either way.
 */
export function CurrencyForm({
  existing,
  onDone,
}: {
  existing: CurrencyFormValues | null;
  /** Called after a successful add, so the "add currency" form can clear
   *  and collapse. Editing an existing row has nothing to collapse back to,
   *  so it is left unset there. */
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveCurrencyAction, initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) onDone?.();
    // Only re-run when a fresh success actually lands, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`code-${existing?.code ?? "new"}`}>
            ISO 4217 code
          </label>
          <input
            id={`code-${existing?.code ?? "new"}`}
            name="code"
            type="text"
            maxLength={3}
            placeholder="GHS"
            defaultValue={existing?.code ?? ""}
            readOnly={Boolean(existing)}
            required
            className={`${inputClass} uppercase ${existing ? "bg-background text-muted-foreground" : ""}`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`countryLabel-${existing?.code ?? "new"}`}>
            Label (optional)
          </label>
          <input
            id={`countryLabel-${existing?.code ?? "new"}`}
            name="countryLabel"
            type="text"
            placeholder="Ghana"
            defaultValue={existing?.countryLabel ?? ""}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`priority-${existing?.code ?? "new"}`}>
            Priority
          </label>
          <input
            id={`priority-${existing?.code ?? "new"}`}
            name="priority"
            type="number"
            step="1"
            defaultValue={existing?.priority ?? 0}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`usdRate-${existing?.code ?? "new"}`}>
            Units per USD
          </label>
          <input
            id={`usdRate-${existing?.code ?? "new"}`}
            name="usdRate"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={existing?.usdRate ?? ""}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`minTopUp-${existing?.code ?? "new"}`}>
            Min top up
          </label>
          <input
            id={`minTopUp-${existing?.code ?? "new"}`}
            name="minTopUp"
            type="number"
            step="0.01"
            min="0"
            defaultValue={existing?.minTopUp ?? ""}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`maxTopUp-${existing?.code ?? "new"}`}>
            Max top up
          </label>
          <input
            id={`maxTopUp-${existing?.code ?? "new"}`}
            name="maxTopUp"
            type="number"
            step="0.01"
            min="0"
            defaultValue={existing?.maxTopUp ?? ""}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`feeCap-${existing?.code ?? "new"}`}>
            Fee cap
          </label>
          <input
            id={`feeCap-${existing?.code ?? "new"}`}
            name="feeCap"
            type="number"
            step="0.01"
            min="0"
            defaultValue={existing?.feeCap ?? ""}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={existing?.enabled ?? false}
            className="h-4 w-4 rounded border-border"
          />
          Enabled (offered to customers)
        </label>

        <div className="flex items-center gap-2">
          {existing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const confirmed = window.confirm(
                    `Remove ${existing.code} entirely? This only works if no account is on it; disable it instead if you just want to stop offering it.`,
                  );
                  if (!confirmed) return;
                  const result = await removeCurrencyAction(existing.code);
                  if (!result.ok && result.error) window.alert(result.error);
                })
              }
            >
              Remove
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving" : existing ? "Save changes" : "Add currency"}
          </Button>
        </div>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}

/** A compact enable/disable toggle, separate from the full edit form so
 *  flipping a currency on or off does not require opening it. */
export function CurrencyEnabledToggle({
  code,
  enabled,
}: {
  code: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant={enabled ? "outline" : "primary"}
      size="sm"
      disabled={isPending || code === "NGN"}
      title={code === "NGN" ? "NGN can never be disabled." : undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleCurrencyEnabledAction(code, !enabled);
          if (!result.ok && result.error) window.alert(result.error);
        })
      }
    >
      {enabled ? "Disable" : "Enable"}
    </Button>
  );
}
