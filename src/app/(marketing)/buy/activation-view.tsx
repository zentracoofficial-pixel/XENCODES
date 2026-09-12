"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, MessageSquareText, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/currency";
import { getActivationStateAction, cancelActivationAction, type ActivationState } from "./actions";

function useCountdown(expiresAt: string, active: boolean) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, active]);

  return remaining;
}

export function ActivationView({ initial }: { initial: ActivationState }) {
  const router = useRouter();
  const [activation, setActivation] = useState(initial);
  const [copied, setCopied] = useState(false);
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

  function handleCopy() {
    if (!activation.code) return;
    navigator.clipboard.writeText(activation.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <Card className="mx-auto max-w-md overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-5 py-3.5">
        <span className="text-sm font-medium">{activation.phoneNumber}</span>
        {isWaiting ? (
          <Badge variant="warning">Waiting {minutes}:{seconds.toString().padStart(2, "0")}</Badge>
        ) : activation.status === "RECEIVED" ? (
          <Badge variant="success">Delivered</Badge>
        ) : activation.status === "EXPIRED" ? (
          <Badge variant="danger">Expired</Badge>
        ) : (
          <Badge variant="outline">Cancelled</Badge>
        )}
      </div>

      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Service</span>
          <span className="font-medium">{activation.serviceName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Country</span>
          <span className="font-medium">{activation.countryName}</span>
        </div>
        <div className="flex items-center justify-between text-sm border-b border-border pb-4">
          <span className="text-muted-foreground">Price</span>
          <span className="font-medium">{formatNaira(activation.priceKobo)}</span>
        </div>

        {isWaiting ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Waiting for SMS...</p>
            <p className="text-xs text-muted-foreground">
              This updates automatically — no need to refresh.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              className="mt-2"
            >
              {cancelling ? "Cancelling..." : "Cancel & refund"}
            </Button>
          </div>
        ) : null}

        {activation.status === "RECEIVED" && activation.code ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success text-white">
                  <MessageSquareText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{activation.serviceName}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your verification code has arrived.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium hover:bg-secondary transition-colors"
            >
              <span className="tracking-[0.3em] font-mono">{activation.code}</span>
              <span className="flex items-center gap-1.5 text-primary">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Code"}
              </span>
            </button>
          </div>
        ) : null}

        {activation.status === "EXPIRED" || activation.status === "CANCELLED" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <XCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {activation.status === "EXPIRED" ? "No code received" : "Activation cancelled"}
            </p>
            <p className="text-xs text-muted-foreground">
              You&apos;ve been refunded to your wallet — no code, no charge.
            </p>
            <Button onClick={() => router.push("/buy")} className="mt-2">
              Get another number
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
