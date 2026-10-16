"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AttachmentField } from "@/components/support/attachment-field";
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
  const declined = (option: string) =>
    option === "RESOLVED" && !window.confirm("Close this ticket? Any files sent in it will be deleted. The customer opens a new ticket if they need more help.");
  const bound = replyToTicketAction.bind(null, ticketId);
  const [state, formAction, formPending] = useActionState(bound, initial);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  // Clear the text and the file once a reply has gone through.
  useEffect(() => {
    if (state.sent) form.current?.reset();
  }, [state.sent]);

  return (
    <div className="space-y-4">
      <form ref={form} action={formAction} className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <label htmlFor="body" className="text-sm font-medium">
          Reply to customer
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          placeholder="Write your reply. The customer sees it in their dashboard as soon as you send it."
          className="h-auto w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
        <AttachmentField key={state.sent ?? 0} onError={setFileError} />
        {fileError ?? state.error ? <p className="text-sm text-danger">{fileError ?? state.error}</p> : null}
        {state.success ? (
          <p className="text-sm text-success">Reply sent. The customer will see it in their dashboard.</p>
        ) : null}
        <Button type="submit" disabled={formPending || Boolean(fileError)} size="sm">
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
                !declined(option) &&
                startTransition(async () => {
                  await setTicketStatusAction(ticketId, option);
                  router.refresh();
                })
              }
            >
              {option === "RESOLVED" ? "Close ticket" : option}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
