"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatPhoneNumber } from "@/lib/currency";
import { StatusStepper } from "@/components/product/status-stepper";

/**
 * What a customer looks at while their code is on the way, and the moment
 * it lands. Presentational on purpose: the buy flow drives it entirely
 * from a real order's state, and nothing else renders it, so there is no
 * path by which an invented number or code reaches this component.
 */

export type PanelStatus =
  | "WAITING"
  | "RECEIVED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export interface ActivationPanelProps {
  serviceSlug: string;
  serviceName: string;
  serviceColor: string;
  countryName: string;
  phoneNumber: string;
  status: PanelStatus;
  code: string | null;
  /** Seconds left in the session. */
  secondsRemaining: number;
  /** ISO timestamps, shown for clarity on exactly when each stage happened. */
  createdAt?: string;
  receivedAt?: string | null;
  footer?: React.ReactNode;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function CopyButton({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
      }}
      className={className}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {children ?? "Copy"}
        </>
      )}
    </button>
  );
}

export function ActivationPanel({
  serviceSlug,
  serviceName,
  serviceColor,
  countryName,
  phoneNumber,
  status,
  code,
  secondsRemaining,
  createdAt,
  receivedAt,
  footer,
}: ActivationPanelProps) {
  const received = status === "RECEIVED" && code;
  const closed =
    status === "EXPIRED" || status === "CANCELLED" || status === "REFUNDED";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-panel)]">
      <StatusStepper status={status} />
      <div className="h-px bg-border" />
      {/* Who and where. */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 sm:px-5">
        <ServiceLogo
          slug={serviceSlug}
          name={serviceName}
          color={serviceColor}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{serviceName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {countryName}
            {createdAt ? ` · Ordered ${formatClock(createdAt)}` : ""}
          </p>
        </div>
        {status === "WAITING" ? (
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
            {formatDuration(secondsRemaining)}
          </span>
        ) : null}
      </div>

      {/* The number. */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Your number</p>
          <p className="mt-1 truncate font-mono text-lg font-medium tracking-tight tabular-nums sm:text-xl">
            {formatPhoneNumber(phoneNumber)}
          </p>
        </div>
        <CopyButton
          value={phoneNumber}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 text-xs font-medium transition-colors hover:border-mint hover:bg-mint-soft"
        >
          Copy
        </CopyButton>
      </div>

      {/* The code, or the wait for it. */}
      {received ? (
        <div className="animate-rise bg-forest px-4 py-5 sm:px-5">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-mint" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">
              SMS received
            </p>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-xs text-white/60">Your verification code</p>
            {receivedAt ? (
              <p className="text-xs text-white/60">Received at {formatClock(receivedAt)}</p>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[2.5rem] font-semibold leading-none tracking-[0.12em] text-white tabular-nums">
              {code}
            </p>
            <CopyButton
              value={code}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-mint px-4 text-sm font-semibold text-forest-dark transition-[filter] hover:brightness-[0.96]"
            >
              Copy code
            </CopyButton>
          </div>
        </div>
      ) : closed ? (
        <div className="px-4 py-5 sm:px-5">
          <p className="text-sm font-medium">
            {status === "EXPIRED"
              ? "No code arrived"
              : status === "REFUNDED"
                ? "Refunded by the number provider"
                : "Activation cancelled"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            You were refunded in full. Nothing was charged for this number.
          </p>
        </div>
      ) : (
        <div className="px-4 py-5 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 animate-live rounded-full bg-mint" />
            <p className="text-sm font-medium">Waiting for SMS</p>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter the number above on {serviceName}. The code shows here the
            moment it arrives.
          </p>
          {/* Where the code will appear, so the wait has a shape. */}
          <div className="mt-4 flex gap-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-11 flex-1 rounded-lg border border-dashed border-border bg-background",
                  "max-w-[3rem]",
                )}
              />
            ))}
          </div>
        </div>
      )}

      {footer ? (
        <div className="border-t border-border px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </div>
  );
}
