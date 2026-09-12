"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/currency";
import {
  getActivationStateAction,
  cancelActivationAction,
  type ActivationState,
} from "./actions";

function useCountdown(expiresAt: string, active: boolean) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setRemaining(
        Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, active]);

  return remaining;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ActivationView({ initial }: { initial: ActivationState }) {
  const router = useRouter();
  const [activation, setActivation] = useState(initial);
  const [codeCopied, setCodeCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWaiting = activation.status === "WAITING";
  const remaining = useCountdown(activation.expiresAt, isWaiting);

  useEffect(() => {
    if (!isWaiting) return;
    pollRef.current = setInterval(async () => {
      const next = await getActivationStateAction(activation.id);
      if (next) setActivation(next);
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isWaiting, activation.id]);

  async function handleCancel() {
    setCancelling(true);
    const result = await cancelActivationAction(activation.id);
    if (result) setActivation(result);
    setCancelling(false);
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const refunded = activation.status === "EXPIRED" || activation.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-lg">
      <Card className="overflow-hidden">
        {/* Number header */}
        <div className="flex items-center justify-between gap-4 border-b border-border bg-secondary/50 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-lg font-medium tracking-tight">
              {activation.phoneNumber}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activation.serviceName} · {activation.countryName}
            </p>
          </div>
          <CopyButton value={activation.phoneNumber} label="Copy number" />
        </div>

        {/* Status body */}
        <div className="p-6">
          {isWaiting ? (
            <div className="text-center">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary-muted">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </span>
              </div>
              <p className="mt-5 font-semibold">Waiting for the SMS</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter the number above where you&apos;re verifying. This screen
                updates on its own.
              </p>
              <p className="mt-5 font-mono text-3xl font-semibold tabular-nums">
                {minutes}:{seconds.toString().padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                left in this session
              </p>
            </div>
          ) : null}

          {activation.status === "RECEIVED" && activation.code ? (
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-3 py-1 text-xs font-medium text-success">
                <Check className="h-3.5 w-3.5" />
                Code received
              </span>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(activation.code!);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                className={cn(
                  "mt-5 block w-full rounded-2xl border-2 border-dashed p-6 transition-colors",
                  codeCopied
                    ? "border-success bg-success-muted"
                    : "border-border hover:border-primary/50 hover:bg-secondary",
                )}
              >
                <span className="block font-mono text-5xl font-semibold tracking-[0.15em] text-primary sm:text-6xl">
                  {activation.code}
                </span>
                <span className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium">
                  {codeCopied ? (
                    <>
                      <Check className="h-4 w-4 text-success" />
                      Copied to clipboard
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Tap to copy
                    </>
                  )}
                </span>
              </button>

              <Button
                href="/buy"
                variant="outline"
                className="mt-5"
              >
                Buy another number
              </Button>
            </div>
          ) : null}

          {refunded ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <XCircle className="h-7 w-7 text-muted-foreground" />
              </span>
              <p className="mt-5 font-semibold">
                {activation.status === "EXPIRED"
                  ? "No code arrived in time"
                  : "You cancelled this number"}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {formatNaira(activation.priceKobo)} has gone back to your wallet
                — no code, no charge.
              </p>
              <Button onClick={() => router.push("/buy")} className="mt-5">
                <RotateCcw className="h-4 w-4" />
                Try another number
              </Button>
            </div>
          ) : null}
        </div>

        {/* Footer meta */}
        <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3.5 text-xs">
          <span className="text-muted-foreground">
            Paid {formatNaira(activation.priceKobo)}
          </span>
          {isWaiting ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel & refund"}
            </button>
          ) : (
            <span className="text-muted-foreground">
              {activation.status === "RECEIVED" ? "Completed" : "Refunded"}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
