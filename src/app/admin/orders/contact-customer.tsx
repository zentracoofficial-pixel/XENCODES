"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contactCustomerAboutOrderAction, type ContactCustomerResult } from "./actions";

/**
 * "Message the customer" on an order. Starts a real support conversation
 * about this order: the customer gets it in their dashboard (bell) and by
 * email, and replies there. The box arrives pre-filled with a suggested
 * message for the order's state, which the admin is free to rewrite.
 */
export function ContactCustomer({
  activationId,
  customerEmail,
  suggestedMessage,
  openTicketId,
}: {
  activationId: string;
  customerEmail: string;
  suggestedMessage: string;
  /** An existing, unresolved conversation about this order, if there is one. */
  openTicketId: string | null;
}) {
  const [state, action, pending] = useActionState<ContactCustomerResult, FormData>(
    contactCustomerAboutOrderAction.bind(null, activationId),
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Write to <span className="font-medium text-foreground">{customerEmail}</span> about this order.
          They see it in their dashboard, and the first message also goes by email. Later messages show up when they next sign in.
        </p>
        {openTicketId ? (
          <Link
            href={`/admin/support/${openTicketId}`}
            className="text-sm font-medium text-forest underline-offset-4 hover:underline"
          >
            Open the existing conversation
          </Link>
        ) : null}
      </div>

      <textarea
        name="body"
        required
        rows={5}
        maxLength={5000}
        defaultValue={suggestedMessage}
        aria-label="Message to the customer"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
      />

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-success">
          Sent. {state.emailSkipped
            ? "They were already emailed in this conversation, so they will see this when they sign in."
            : state.emailed
              ? "They have been emailed too."
              : "The email could not be sent, but it is in their dashboard."}{" "}
          {state.ticketId ? (
            <Link
              href={`/admin/support/${state.ticketId}`}
              className="font-medium text-forest underline-offset-4 hover:underline"
            >
              Open the conversation
            </Link>
          ) : null}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        <MessageSquare className="h-4 w-4" />
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
