"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { reportIssueAction, type ReportState } from "./actions";

export interface ReportableActivation {
  id: string;
  serviceName: string;
  countryName: string;
  phoneNumber: string;
  status: string;
  createdAt: string;
}

const initial: ReportState = {};

export function ReportIssue({
  activations,
}: {
  activations: ReportableActivation[];
}) {
  const [state, formAction, pending] = useActionState(reportIssueAction, initial);

  if (state.success) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-mint bg-mint-soft px-5 py-4">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
        <div>
          <p className="text-sm font-medium text-forest">Report received</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            We will look into it and reply here in your dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (activations.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted-foreground">
        Nothing to report. None of your activations are waiting or expired.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
    >
      <div className="space-y-1.5">
        <label htmlFor="activationId" className="text-sm font-medium">
          Which activation?
        </label>
        <select id="activationId" name="activationId" required className={fieldClass}>
          {activations.map((activation) => (
            <option key={activation.id} value={activation.id}>
              {activation.serviceName}, {activation.countryName},{" "}
              {activation.phoneNumber} ({activation.createdAt})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="details" className="text-sm font-medium">
          What went wrong?
        </label>
        <textarea
          id="details"
          name="details"
          required
          rows={4}
          placeholder="Tell us what happened. Include anything the service showed you."
          className={`${fieldClass} h-auto py-2.5`}
        />
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Submit report"}
      </Button>
    </form>
  );
}
