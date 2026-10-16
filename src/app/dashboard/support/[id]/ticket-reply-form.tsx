"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AttachmentField } from "@/components/support/attachment-field";
import { replyToTicketAsUserAction, type ReplyState } from "../actions";

const initial: ReplyState = {};

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const bound = replyToTicketAsUserAction.bind(null, ticketId);
  const [state, formAction, pending] = useActionState(bound, initial);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  // Clear the text and the file once a reply has gone through.
  useEffect(() => {
    if (state.sent) form.current?.reset();
  }, [state.sent]);

  return (
    <form
      ref={form}
      action={formAction}
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
    >
      <label htmlFor="body" className="text-sm font-medium">
        Reply
      </label>
      <textarea
        id="body"
        name="body"
        rows={4}
        placeholder="Add more detail, or reply to what support said."
        className="h-auto w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
      />
      <AttachmentField key={state.sent ?? 0} onError={setFileError} />
      {fileError ?? state.error ? <p className="text-sm text-danger">{fileError ?? state.error}</p> : null}
      <Button type="submit" disabled={pending || Boolean(fileError)} size="sm">
        {pending ? "Sending" : "Send reply"}
      </Button>
    </form>
  );
}
