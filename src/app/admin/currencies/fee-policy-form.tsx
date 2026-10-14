"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { saveFeePolicyAction, type FeePolicyFormState } from "./actions";

const initial: FeePolicyFormState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export function FeePolicyForm({
  currency,
  values,
}: {
  currency: string;
  values: {
    model: "percent" | "fixed";
    percent: number;
    fixed: number;
    cap: number | null;
    approved: boolean;
    enabled: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
    exists: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(saveFeePolicyAction, initial);
  const [model, setModel] = useState(values.model);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="currency" value={currency} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor={`fee-model-${currency}`}>
            Fee type
          </label>
          <select
            id={`fee-model-${currency}`}
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value === "fixed" ? "fixed" : "percent")}
            className={inputClass}
          >
            <option value="percent">Percentage</option>
            <option value="fixed">Flat amount</option>
          </select>
        </div>
        {model === "percent" ? (
          <>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor={`fee-percent-${currency}`}>
                Percent of the amount
              </label>
              <input
                id={`fee-percent-${currency}`}
                name="percent"
                type="number"
                step="0.01"
                min="0"
                max="50"
                defaultValue={values.percent}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor={`fee-cap-${currency}`}>
                Cap ({currency}, optional)
              </label>
              <input
                id={`fee-cap-${currency}`}
                name="cap"
                type="number"
                step="any"
                min="0"
                defaultValue={values.cap ?? ""}
                placeholder="No cap"
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <label className={labelClass} htmlFor={`fee-fixed-${currency}`}>
              Flat fee ({currency})
            </label>
            <input
              id={`fee-fixed-${currency}`}
              name="fixed"
              type="number"
              step="any"
              min="0"
              defaultValue={values.fixed}
              className={inputClass}
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="approved" defaultChecked={values.approved} className="mt-0.5 h-4 w-4 accent-[var(--forest)]" />
        <span>
          <span className="font-medium">Approved.</span> I have decided this is the fee for {currency} funding.
          Without approval, {currency} funding is not offered.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="mt-0.5 h-4 w-4 accent-[var(--forest)]" />
        <span>
          <span className="font-medium">Charge and show this fee.</span> Leave off for no fee: funding still works,
          and no fee is shown or added.
        </span>
      </label>

      {values.approved && values.approvedBy ? (
        <p className="text-xs text-muted-foreground">
          Approved by {values.approvedBy}
          {values.approvedAt ? ` on ${new Date(values.approvedAt).toLocaleDateString("en-GB")}` : ""}.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save fee"}
        </Button>
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state.success ? <p className="text-sm text-success">Saved.</p> : null}
      </div>
    </form>
  );
}
