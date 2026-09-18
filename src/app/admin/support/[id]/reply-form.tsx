"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  replyToTicketAction,
  setTicketStatusAction,
  type ReplyState,
} from "../actions";

const initial: ReplyState = {};

const STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;

export function TicketReplyForm({
  ticketId,
  status,
}: {
  ticketId: string;
  status: "OPEN" | "PENDING" | "RESOLVED";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const bound = replyToTicketAction.bind(null, ticketId);
  const [state, formAction, formPending] = useActionState(bound, initial);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <label htmlFor="body" className="text-sm font-medium">
          Reply to customer
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={5}
          placeholder="Write your reply. It's emailed to the customer as soon as you send it."
          className="h-auto w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        {state.success ? (
          <p className="text-sm text-success">Reply sent and emailed to the customer.</p>
        ) : null}
        <Button type="submit" disabled={formPending} size="sm">
          {formPending ? "Sending" : "Send reply"}
        </Button>
      </form>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-5">
        <span className="text-sm font-medium">Status</span>
        <div className="ml-auto flex gap-1.5">
          {STATUSES.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={status === option ? "primary" : "outline"}
              disabled={isPending || status === option}
              onClick={() =>
                startTransition(async () => {
                  await setTicketStatusAction(ticketId, option);
                  router.refresh();
                })
              }
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
