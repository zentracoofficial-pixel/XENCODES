"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveCurrencyAction, type CurrencyFormState } from "./actions";
import type { CurrencyCode } from "@/lib/currency-config";

const initial: CurrencyFormState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

/**
 * Edits one of the two fixed currencies' rate and top-up bounds. No add,
 * remove, or enable/disable here: NGN and USD are the whole set, and this
 * form only ever updates the row it was given.
 */
export function CurrencyForm({
  code,
  editableRate,
  values,
}: {
  code: CurrencyCode;
  /** Only NGN's rate is editable: 1 USD converted into USD is always 1
   *  USD, so USD's row shows it read-only rather than accepting an edit
   *  that would be silently ignored on save. */
  editableRate: boolean;
  values: { usdRate: number; minTopUp: number; maxTopUp: number; feeCap: number };
}) {
  const [state, formAction, pending] = useActionState(saveCurrencyAction, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="code" value={code} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`usdRate-${code}`}>
            Units per USD
          </label>
          <input
            id={`usdRate-${code}`}
            name="usdRate"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={values.usdRate}
            readOnly={!editableRate}
            required={editableRate}
            className={`${inputClass} ${editableRate ? "" : "bg-background text-muted-foreground"}`}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`minTopUp-${code}`}>
            Min top up
          </label>
          <input
            id={`minTopUp-${code}`}
            name="minTopUp"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.minTopUp}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`maxTopUp-${code}`}>
            Max top up
          </label>
          <input
            id={`maxTopUp-${code}`}
            name="maxTopUp"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.maxTopUp}
            required
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`feeCap-${code}`}>
            Fee cap
          </label>
          <input
            id={`feeCap-${code}`}
            name="feeCap"
            type="number"
            step="0.01"
            min="0"
            defaultValue={values.feeCap}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save changes"}
        </Button>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}
    </form>
  );
}
