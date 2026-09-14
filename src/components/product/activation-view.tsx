"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ActivationPanel,
  formatDuration,
} from "@/components/product/activation-panel";
import { formatNaira } from "@/lib/currency";
import {
  cancelActivationAction,
  getActivationStateAction,
  type ActivationState,
} from "@/app/(marketing)/buy/actions";

/**
 * A purchased number, and the wait for its code.
 *
 * Polls only while the activation is actually outstanding and stops the
 * moment it settles, so a finished order is not still generating provider
 * traffic in a background tab. The interval is deliberately unhurried:
 * the provider rate limits, and a code that has not arrived yet will not
 * arrive faster for being asked about more often.
 */

const POLL_MS = 5000;

export interface ResumedActivation extends ActivationState {
  serviceColor: string;
}

function useCountdown(expiresAt: string | undefined, active: boolean) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () =>
      setRemaining(
        Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
      );
    tick();
    if (!active) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, active]);

  return remaining;
}

export function ActivationView({
  activation: initial,
  backHref = "/buy",
}: {
  activation: ResumedActivation;
  /** Where "buy another number" goes. The dashboard keeps the customer
   *  inside its own shell rather than sending them to the public route. */
  backHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [activation, setActivation] = useState<ResumedActivation>(initial);

  const waiting = activation.status === "WAITING";
  const remaining = useCountdown(activation.expiresAt, waiting);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!waiting) return;

    const interval = setInterval(async () => {
      // Skip a tick rather than stacking requests if the provider is slow.
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await getActivationStateAction(activation.id);
        if (next) setActivation({ ...next, serviceColor: activation.serviceColor });
      } finally {
        inFlight.current = false;
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [activation.id, activation.serviceColor, waiting]);

  function cancel() {
    startTransition(async () => {
      const next = await cancelActivationAction(activation.id);
      if (next) setActivation({ ...next, serviceColor: activation.serviceColor });
    });
  }

  const heading =
    activation.status === "WAITING"
      ? "Your number is ready"
      : activation.status === "RECEIVED"
        ? "Code received"
        : "Activation closed";

  const subheading =
    activation.status === "WAITING"
      ? `Enter this number on ${activation.serviceName}. The code appears below on its own.`
      : activation.status === "RECEIVED"
        ? "Paste this code to finish verifying."
        : "You were refunded in full.";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subheading}</p>

      <div className="mt-6">
        <ActivationPanel
          serviceSlug={activation.serviceSlug}
          serviceName={activation.serviceName}
          serviceColor={activation.serviceColor}
          countryName={activation.countryName}
          flag={activation.flag}
          phoneNumber={activation.phoneNumber}
          status={activation.status}
          code={activation.code}
          secondsRemaining={remaining}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {activation.status === "WAITING"
                  ? `Refunded automatically in ${formatDuration(remaining)} if no code arrives`
                  : `Paid ${formatNaira(activation.priceKobo)}`}
              </span>
              {activation.status === "WAITING" ? (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={pending}
                  className="-my-2 py-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
                >
                  Cancel and refund
                </button>
              ) : (
                <Link
                  href={backHref}
                  className="-my-2 py-2 text-xs font-medium text-forest underline-offset-4 hover:underline"
                >
                  Buy another number
                </Link>
              )}
            </div>
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button href="/dashboard/history" variant="outline" size="sm">
          View history
        </Button>
        <Button href="/dashboard" variant="ghost" size="sm">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
