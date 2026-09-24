"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { createGeneralTicketAction, type ReportState } from "./actions";

const initial: ReportState = {};

export function NewTicketForm() {
  const [state, formAction, pending] = useActionState(createGeneralTicketAction, initial);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
    >
      <div className="space-y-1.5">
        <label htmlFor="subject" className="text-sm font-medium">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          placeholder="What's this about?"
          className={fieldClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="details" className="text-sm font-medium">
          Details
        </label>
        <textarea
          id="details"
          name="details"
          required
          rows={4}
          placeholder="Tell us what's going on."
          className={`${fieldClass} h-auto py-2.5`}
        />
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Start ticket"}
      </Button>
    </form>
  );
}
