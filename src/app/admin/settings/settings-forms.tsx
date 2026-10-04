"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  saveMarginSettingsAction,
  saveTopupFeeSettingsAction,
  saveRecoverySettingsAction,
  saveAnnouncementAction,
  sendTestEmailAction,
  type SettingsState,
  type TestEmailState,
} from "./actions";
import { RECOVERY_TEMPLATE_VARIABLES } from "@/lib/recovery-template-vars";
import { ANNOUNCEMENT_MESSAGE_MAX, ANNOUNCEMENT_TITLE_MAX } from "@/lib/announcement-limits";
import { AnnouncementModal } from "@/components/announcement-modal";

const initial: SettingsState = {};
const initialTestEmail: TestEmailState = {};

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25";
const labelClass = "text-xs font-medium text-muted-foreground";

export function MarginForm({
  defaultPercent,
  exclusivePercent,
}: {
  defaultPercent: number;
  exclusivePercent: number;
}) {
  const [state, formAction, pending] = useActionState(
    saveMarginSettingsAction,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid max-w-md gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="defaultMargin">
            Standard gross margin
          </label>
          <div className="flex items-center gap-2">
            <input
              id="defaultMargin"
              name="defaultMargin"
              type="number"
              step="1"
              min="0"
              max="99"
              defaultValue={defaultPercent}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="exclusiveMargin">
            Exclusive tier margin
          </label>
          <div className="flex items-center gap-2">
            <input
              id="exclusiveMargin"
              name="exclusiveMargin"
              type="number"
              step="1"
              min="0"
              max="99"
              defaultValue={exclusivePercent}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Gross margin is profit as a share of what the customer pays, not a
        markup on cost. At 50% the customer pays twice the provider cost. A
        50% markup would only be a 33% margin, which is why these are entered
        as margins everywhere.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save margins"}
      </Button>
    </form>
  );
}

export function TopupFeeForm({ feePercent }: { feePercent: number }) {
  const [state, formAction, pending] = useActionState(saveTopupFeeSettingsAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div className="max-w-xs space-y-1.5">
        <label className={labelClass} htmlFor="feePercent">
          Percentage fee
        </label>
        <div className="flex items-center gap-2">
          <input
            id="feePercent"
            name="feePercent"
            type="number"
            step="0.01"
            min="0"
            max="20"
            defaultValue={feePercent}
            className={inputClass}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Added on top of every wallet top-up, so KoraPay&apos;s processing
        cost is paid by the customer rather than absorbed here. The wallet
        is still credited exactly the amount the customer asked for; only
        what they are charged at checkout includes this fee. Defaults to
        KoraPay&apos;s own published rate (1.5%) — only change this if
        KoraPay quotes this account a different negotiated rate. The cap on
        this fee is set per currency on Currencies, since a sensible cap
        varies by currency the way the percentage does not.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save fee"}
      </Button>
    </form>
  );
}

export function RecoverySettingsForm({
  autoEmailEnabled,
  threshold,
  windowDays,
  cooldownDays,
  subject,
  body,
}: {
  autoEmailEnabled: boolean;
  threshold: number;
  windowDays: number;
  cooldownDays: number;
  subject: string;
  body: string;
}) {
  const [state, formAction, pending] = useActionState(saveRecoverySettingsAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          name="autoEmailEnabled"
          defaultChecked={autoEmailEnabled}
          className="h-4 w-4 rounded border-border accent-forest"
        />
        Send the automatic email below on its own, in addition to letting an admin send one
        manually from Recovery
      </label>

      <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="threshold">
            No-code threshold
          </label>
          <input
            id="threshold"
            name="threshold"
            type="number"
            step="1"
            min="1"
            max="50"
            defaultValue={threshold}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="windowDays">
            Detection window (days)
          </label>
          <input
            id="windowDays"
            name="windowDays"
            type="number"
            step="1"
            min="1"
            max="365"
            defaultValue={windowDays}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass} htmlFor="cooldownDays">
            Email cooldown (days)
          </label>
          <input
            id="cooldownDays"
            name="cooldownDays"
            type="number"
            step="1"
            min="0"
            max="365"
            defaultValue={cooldownDays}
            className={inputClass}
          />
        </div>
      </div>
      <p className="max-w-xl text-xs text-muted-foreground">
        A customer with this many purchases that settled without a code, within the window, shows
        up on Recovery. The cooldown only limits the automatic email — a manual send from Recovery
        is never blocked by it.
      </p>

      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="recovery-subject">
          Automatic email subject
        </label>
        <input id="recovery-subject" name="subject" type="text" defaultValue={subject} className={inputClass} />
      </div>
      <div className="space-y-1.5">
        <label className={labelClass} htmlFor="recovery-body">
          Automatic email body
        </label>
        <textarea
          id="recovery-body"
          name="body"
          rows={8}
          defaultValue={body}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
        <p className="text-xs text-muted-foreground">
          Personalize with:{" "}
          {RECOVERY_TEMPLATE_VARIABLES.map((v) => (
            <code key={v} className="mr-1">{`{{${v}}}`}</code>
          ))}
          . Anything else in the text is sent exactly as typed.
        </p>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save recovery settings"}
      </Button>
    </form>
  );
}

/**
 * A real send, not a status check: the surest way to know whether outbound
 * email actually works on this exact deployment right now is to try it and
 * read back what actually happened, including Resend's own error text
 * verbatim if it fails.
 *
 * Defaults the recipient to the support inbox rather than the admin's own
 * address: sending to your own @xencodes.com address only proves Resend
 * accepts the message, since same-domain delivery has nothing to
 * authenticate. The support inbox is normally an external address (Gmail,
 * Outlook, ...), and whether an external mailbox actually places the
 * message in the inbox rather than spam is the real question — editable so
 * it can also be pointed at any other address to test.
 */
export function AnnouncementForm({
  enabled,
  title,
  message,
}: {
  enabled: boolean;
  title: string;
  message: string;
}) {
  const [state, formAction, pending] = useActionState(saveAnnouncementAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<{ title: string; message: string } | null>(null);

  function openPreview() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    setPreview({
      title: String(data.get("title") ?? "").trim() || "Your title",
      message: String(data.get("message") ?? "").trim() || "Your message.",
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4" />
        Show the announcement to signed-in customers
      </label>

      <div className="max-w-xl space-y-1.5">
        <label className={labelClass} htmlFor="announcementTitle">
          Title
        </label>
        <input
          id="announcementTitle"
          name="title"
          type="text"
          maxLength={ANNOUNCEMENT_TITLE_MAX}
          defaultValue={title}
          className={inputClass}
        />
      </div>

      <div className="max-w-xl space-y-1.5">
        <label className={labelClass} htmlFor="announcementMessage">
          Message
        </label>
        <textarea
          id="announcementMessage"
          name="message"
          rows={5}
          maxLength={ANNOUNCEMENT_MESSAGE_MAX}
          defaultValue={message}
          className={cn(inputClass, "h-auto py-2 leading-relaxed")}
        />
      </div>

      <p className="max-w-xl text-xs text-muted-foreground">
        Shown as a popup the first time a signed-in customer opens their dashboard. Once they close
        it, it stays closed until you change the wording, so use this to announce a price change.
        Leave a blank line between paragraphs. Plain text only.
      </p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-success">Saved.</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save announcement"}
        </Button>
        <Button type="button" variant="outline" onClick={openPreview}>
          Preview popup
        </Button>
      </div>

      {preview ? (
        <AnnouncementModal
          title={preview.title}
          message={preview.message}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </form>
  );
}

export function TestEmailButton({ defaultTo }: { defaultTo: string }) {
  const [state, formAction, pending] = useActionState(sendTestEmailAction, initialTestEmail);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="to"
          type="email"
          defaultValue={defaultTo}
          placeholder="Address to test"
          className={cn(inputClass, "h-9 w-64")}
        />
        <Button type="submit" disabled={pending} variant="outline" size="sm">
          {pending ? "Sending..." : "Send test email"}
        </Button>
      </div>

      {state.status === "sent" ? (
        <p className="text-sm text-success">{state.message}</p>
      ) : null}
      {state.status === "error" ? (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
