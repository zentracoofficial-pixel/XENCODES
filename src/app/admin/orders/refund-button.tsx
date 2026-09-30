"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { adminRefundActivationAction, adminRecheckActivationAction } from "./actions";
import type { AdminRefundReason } from "@/lib/activation-lifecycle";

const REASON_OPTIONS: { value: AdminRefundReason; label: string }[] = [
  { value: "NO_SMS_RECEIVED", label: "No SMS received" },
  { value: "ACTIVATION_EXPIRED", label: "Activation expired" },
  { value: "PROVIDER_FAILURE", label: "Provider failure" },
  { value: "CUSTOMER_SUPPORT", label: "Customer support refund" },
  { value: "OTHER", label: "Other" },
];

/**
 * The admin panel's manual refund control for a still-pending order. Never
 * credits from the click alone: adminRefundActivationAction() re-verifies
 * against the provider first and only refunds if the order is genuinely
 * still stuck — see its own comment and adminForceRefundActivation() in
 * src/lib/activation-lifecycle.ts for the actual eligibility checks. This
 * component only collects the reason, shows the confirmation the task
 * requires (customer, amount, service, country, reason — never a guess),
 * and reports back exactly what happened.
 */
export function RefundButton({
  activationId,
  customerEmail,
  amountKobo,
  currency,
  serviceName,
  countryName,
}: {
  activationId: string;
  customerEmail: string;
  amountKobo: number;
  currency: string;
  serviceName: string;
  countryName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AdminRefundReason>("NO_SMS_RECEIVED");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [recheckStatus, setRecheckStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rechecking, startRecheck] = useTransition();

  if (done) {
    return (
      <p className="text-sm text-success">
        Refunded {formatMoney(amountKobo, currency)} to {customerEmail}&apos;s wallet.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          <AlertTriangle className="h-4 w-4" />
          Refund
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={rechecking}
          onClick={() => {
            setRecheckStatus(null);
            startRecheck(async () => {
              const result = await adminRecheckActivationAction(activationId);
              setRecheckStatus(result.error ?? `Now ${result.status?.toLowerCase()}.`);
            });
          }}
        >
          <RefreshCw className={rechecking ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {rechecking ? "Checking…" : "Check status now"}
        </Button>
        {recheckStatus ? <p className="text-sm text-muted-foreground">{recheckStatus}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3.5">
      <div className="text-sm">
        <p>
          Customer: <span className="font-medium">{customerEmail}</span>
        </p>
        <p>
          Amount: <span className="font-medium">{formatMoney(amountKobo, currency)}</span>
        </p>
        <p>
          Service: <span className="font-medium">{serviceName}</span>, {countryName}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-reason">
          Reason
        </label>
        <select
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as AdminRefundReason)}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        >
          {REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {reason === "OTHER" ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-note">
            Note (required)
          </label>
          <textarea
            id="refund-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
            placeholder="Why this refund is being issued"
          />
        </div>
      ) : null}

      <p className="text-sm font-medium">
        Refund {formatMoney(amountKobo, currency)} to this customer&apos;s wallet?
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="danger"
          size="sm"
          disabled={pending || (reason === "OTHER" && !note.trim())}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await adminRefundActivationAction(activationId, reason, note);
              if (result.error) {
                setError(result.error);
                return;
              }
              setDone(true);
            });
          }}
        >
          {pending ? "Refunding…" : "Confirm refund"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
