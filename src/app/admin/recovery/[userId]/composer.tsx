"use client";

import { useState, useTransition } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  previewRecoveryEmailAction,
  sendRecoveryEmailAction,
  type RecoveryPreviewState,
  type SendRecoveryState,
} from "../actions";
import { RECOVERY_TEMPLATE_VARIABLES } from "@/lib/recovery-template-vars";

/**
 * Compose -> Preview -> Send, in that order: the Send button only appears
 * once a preview has been generated for the exact text currently in the
 * boxes, and re-hides itself the moment the admin edits either field again
 * — so what gets sent can never be something that was never actually
 * previewed. Nothing here is a template variable outside
 * RECOVERY_TEMPLATE_VARIABLES: those are the only tokens the server will
 * ever substitute (see renderRecoveryTemplate in src/lib/recovery.ts),
 * anything else in the text is sent exactly as typed.
 */
export function RecoveryComposer({
  userId,
  defaultSubject,
  defaultBody,
}: {
  userId: string;
  defaultSubject: string;
  defaultBody: string;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [previewedFor, setPreviewedFor] = useState<{ subject: string; body: string } | null>(null);
  const [preview, setPreview] = useState<RecoveryPreviewState | null>(null);
  const [sendResult, setSendResult] = useState<SendRecoveryState | null>(null);
  const [previewing, startPreview] = useTransition();
  const [sending, startSend] = useTransition();

  const matchesPreview =
    previewedFor?.subject === subject && previewedFor?.body === body && !preview?.error;

  function onEdit(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setSendResult(null);
    };
  }

  function runPreview() {
    startPreview(async () => {
      const result = await previewRecoveryEmailAction(userId, subject, body);
      setPreview(result);
      setPreviewedFor({ subject, body });
      setSendResult(null);
    });
  }

  function runSend() {
    startSend(async () => {
      const result = await sendRecoveryEmailAction(userId, subject, body);
      setSendResult(result);
      if (result.success) {
        setPreview(null);
        setPreviewedFor(null);
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Card className="space-y-4 p-5">
        <div>
          <label htmlFor="recovery-subject" className="text-xs font-medium text-muted-foreground">
            Subject
          </label>
          <input
            id="recovery-subject"
            value={subject}
            onChange={(e) => onEdit(setSubject)(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
        <div>
          <label htmlFor="recovery-body" className="text-xs font-medium text-muted-foreground">
            Message
          </label>
          <textarea
            id="recovery-body"
            rows={10}
            value={body}
            onChange={(e) => onEdit(setBody)(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Personalize with:{" "}
            {RECOVERY_TEMPLATE_VARIABLES.map((v) => (
              <code key={v} className="mr-1">{`{{${v}}}`}</code>
            ))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={previewing} onClick={runPreview}>
            {previewing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rendering…
              </>
            ) : (
              "Preview"
            )}
          </Button>

          {matchesPreview && !sendResult?.success ? (
            <Button type="button" disabled={sending} onClick={runSend} className="gap-1.5">
              {sending ? (
                "Sending…"
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Send message
                </>
              )}
            </Button>
          ) : null}
        </div>

        {preview?.error ? <p className="text-sm text-danger">{preview.error}</p> : null}
        {sendResult?.error ? <p className="text-sm text-danger">{sendResult.error}</p> : null}
        {sendResult?.success ? (
          <p className="text-sm text-success">Message sent and logged.</p>
        ) : null}
        {matchesPreview && !sendResult?.success ? (
          <p className="text-xs text-muted-foreground">
            This is exactly what will be sent to the customer. Review it before confirming.
          </p>
        ) : null}
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        {preview?.html ? (
          <div className="rounded-xl border border-border bg-background p-3">
            <iframe
              title="Recovery email preview"
              srcDoc={preview.html}
              className="mx-auto block w-full rounded-lg border border-border"
              style={{ height: "560px" }}
            />
          </div>
        ) : (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Click &ldquo;Preview&rdquo; to see the rendered email before sending.
          </Card>
        )}
      </div>
    </div>
  );
}
