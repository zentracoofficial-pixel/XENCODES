"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberSearch } from "@/components/product/number-search";
import {
  ActivationPanel,
  formatDuration,
} from "@/components/product/activation-panel";
import { DevelopmentDataNotice } from "@/components/product/development-notice";
import { formatNaira } from "@/lib/currency";
import type { CatalogService } from "@/lib/catalog";
import {
  cancelActivationAction,
  getActivationStateAction,
  purchaseNumberAction,
  type ActivationState,
  type PurchaseError,
} from "./actions";

export interface ResumedActivation extends ActivationState {
  serviceColor: string;
}

const POLL_MS = 2500;

const errorCopy: Record<PurchaseError, string> = {
  login_required: "Log in to buy a number.",
  admin_account:
    "Admin accounts don't buy numbers. Use a separate account to shop as a customer.",
  unavailable: "That number just went out of stock. Try another country.",
  insufficient_balance:
    "Your wallet does not have enough for this number. Add funds and try again.",
  provider_unavailable:
    "The number provider is not responding right now. Try again in a moment.",
  unknown: "Something went wrong. Nothing was charged, so please try again.",
};

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

export function BuyFlow({
  services,
  initialServiceSlug,
  resumed,
  signedIn,
  walletBalanceKobo,
  isLive,
}: {
  services: CatalogService[];
  initialServiceSlug?: string;
  resumed: ResumedActivation | null;
  signedIn: boolean;
  walletBalanceKobo: number;
  isLive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activation, setActivation] = useState<ResumedActivation | null>(resumed);

  const waiting = activation?.status === "WAITING";
  const remaining = useCountdown(activation?.expiresAt, waiting);

  const serviceColor = useCallback(
    (slug: string) => services.find((s) => s.slug === slug)?.color ?? "#063B2D",
    [services],
  );

  // Poll while a code is outstanding. Stops as soon as the activation settles.
  const activationId = activation?.id;
  const polling = useRef(false);

  useEffect(() => {
    if (!activationId || !waiting) return;

    const interval = setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const next = await getActivationStateAction(activationId);
        if (next) {
          setActivation({ ...next, serviceColor: serviceColor(next.serviceSlug) });
        }
      } finally {
        polling.current = false;
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [activationId, waiting, serviceColor]);

  function buy(slug: string, countrySlug: string) {
    if (!signedIn) {
      router.push(`/login?callbackUrl=/buy?service=${slug}`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await purchaseNumberAction(slug, countrySlug);

      if (result.error) {
        setError(errorCopy[result.error]);
        return;
      }
      if (!result.activationId) return;

      const state = await getActivationStateAction(result.activationId);
      if (state) {
        setActivation({ ...state, serviceColor: serviceColor(state.serviceSlug) });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function cancel() {
    if (!activationId) return;
    startTransition(async () => {
      const next = await cancelActivationAction(activationId);
      if (next) {
        setActivation({ ...next, serviceColor: serviceColor(next.serviceSlug) });
      }
    });
  }

  if (activation) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">
          {activation.status === "WAITING"
            ? "Your number is ready"
            : activation.status === "RECEIVED"
              ? "Code received"
              : "Activation closed"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {activation.status === "WAITING"
            ? `Enter this number on ${activation.serviceName}. The code appears below automatically.`
            : activation.status === "RECEIVED"
              ? "Paste this code to finish verifying."
              : "You were refunded in full."}
        </p>

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
                    href="/buy"
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

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Get a number
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Pick your service, choose a country, and the number is yours right away.
      </p>

      {signedIn ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Wallet balance
          </span>
          <span className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums">
              {formatNaira(walletBalanceKobo)}
            </span>
            <Link
              href="/dashboard/wallet"
              className="-my-2 py-2 text-xs font-medium text-forest underline-offset-4 hover:underline"
            >
              Add funds
            </Link>
          </span>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-mint-soft px-4 py-3">
          <p className="text-sm text-forest">
            Log in to buy. New here? Registering takes a moment.
          </p>
          <span className="flex gap-2">
            <Button href="/login?callbackUrl=/buy" size="sm" variant="outline">
              Log in
            </Button>
            <Button href="/register" size="sm">
              Register
              <ArrowRight className="h-4 w-4" />
            </Button>
          </span>
        </div>
      )}

      <div className="mt-5">
        <NumberSearch
          services={services}
          initialServiceSlug={initialServiceSlug}
          onPurchase={buy}
          pending={pending}
          error={error}
          autoFocus={!initialServiceSlug}
        />
      </div>

      {!isLive ? <DevelopmentDataNotice className="mt-3" /> : null}
    </div>
  );
}
