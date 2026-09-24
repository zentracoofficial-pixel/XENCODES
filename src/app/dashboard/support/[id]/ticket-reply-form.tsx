"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { replyToTicketAsUserAction, type ReplyState } from "../actions";

const initial: ReplyState = {};

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const bound = replyToTicketAsUserAction.bind(null, ticketId);
  const [state, formAction, pending] = useActionState(bound, initial);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
    >
      <label htmlFor="body" className="text-sm font-medium">
        Reply
      </label>
      <textarea
        id="body"
        name="body"
        required
        rows={4}
        placeholder="Add more detail, or reply to what support said."
        className="h-auto w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
      />
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Sending" : "Send reply"}
      </Button>
    </form>
  );
}
