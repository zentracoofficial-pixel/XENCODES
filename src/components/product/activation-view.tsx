"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ActivationPanel,
  formatDuration,
} from "@/components/product/activation-panel";
import { formatMoney } from "@/lib/currency";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import {
  buyOnServerTwoAction,
  cancelActivationAction,
  getActivationStateAction,
  getServerTwoOfferAction,
  type ActivationState,
  type PurchaseError,
  type ServerTwoOffer,
} from "@/app/dashboard/buy/actions";

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

/** What a failed Server II purchase says. Never names a supplier. */
const serverTwoError: Partial<Record<PurchaseError, string>> = {
  insufficient_balance: "Your wallet does not have enough for this number. Add funds and try again.",
  unavailable: "Premium has no numbers for this right now. Try another country.",
  no_provider: "Premium has no numbers for this right now. Try another country.",
  price_changed: "The Premium price changed. Check the new price and confirm again.",
  unverified_limit_reached:
    "You've reached the purchase limit for unverified accounts. Verify your email to keep buying numbers.",
};

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
  backHref = "/dashboard/buy",
}: {
  activation: ResumedActivation;
  /** Where "buy another number" goes. */
  backHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [activation, setActivation] = useState<ResumedActivation>(initial);
  // What was paid or refunded, in the customer's currency: the price they saw
  // when they bought it when that is the currency they are viewing now.
  const money = useDisplayMoney();
  const priceLabel = money
    ? money.formatRecorded(
        activation.priceKobo,
        { currency: activation.displayCurrency ?? null, minor: activation.displayPriceMinor ?? null },
        activation.currency,
      )
    : formatMoney(activation.priceKobo, activation.currency);

  const waiting = activation.status === "WAITING";
  // An order that ended without a code: offer the same number from Premium.
  const noCode =
    !activation.code &&
    (activation.status === "EXPIRED" || activation.status === "REFUNDED" || activation.status === "CANCELLED");
  const remaining = useCountdown(activation.expiresAt, waiting);
  const inFlight = useRef(false);

  // How long this order has been waiting, from the length of its session and
  // what is left of it (no clock read during render). Once a minute has gone
  // by with no code the refund option is made hard to miss; before that it
  // stays a quiet link, so nobody cancels a number whose code is a few
  // seconds away. `remaining` is 0 until the countdown has started, which is
  // not a long wait.
  const sessionSeconds = Math.max(
    0,
    Math.floor((new Date(activation.expiresAt).getTime() - new Date(activation.createdAt).getTime()) / 1000),
  );
  const waitedLong = waiting && remaining > 0 && sessionSeconds - remaining >= 60;

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

  const router = useRouter();
  const [serverTwo, setServerTwo] = useState<ServerTwoOffer | null>(null);
  const [serverTwoMessage, setServerTwoMessage] = useState<string | null>(null);
  const [buyingServerTwo, startServerTwo] = useTransition();
  const serverTwoKey = useRef<string | null>(null);

  useEffect(() => {
    if (!noCode) return;
    let live = true;
    getServerTwoOfferAction(activation.id)
      .then((offer) => {
        if (live) setServerTwo(offer);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activation.id, noCode]);

  function buyOnServerTwo() {
    if (!serverTwo?.available || serverTwo.priceKobo === undefined) return;
    const expected = serverTwo.priceKobo;
    serverTwoKey.current ??= crypto.randomUUID();
    const key = serverTwoKey.current;
    setServerTwoMessage(null);
    startServerTwo(async () => {
      const result = await buyOnServerTwoAction(activation.id, expected, key);
      if (result.activationId) {
        router.push(`${backHref}?activation=${result.activationId}`);
        router.refresh();
        return;
      }
      if (result.error === "price_changed" && result.priceKobo !== undefined) {
        setServerTwo({ ...serverTwo, priceKobo: result.priceKobo });
      }
      setServerTwoMessage(
        (result.error && serverTwoError[result.error]) ??
          "Unable to complete your request. Nothing was charged, so please try again.",
      );
    });
  }
  const serverTwoPrice =
    serverTwo?.available && serverTwo.priceKobo !== undefined && serverTwo.currency
      ? money
        ? money.format(serverTwo.priceKobo, serverTwo.currency)
        : formatMoney(serverTwo.priceKobo, serverTwo.currency)
      : null;

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
      {activation.status === "WAITING" && activation.serviceSlug === "fiverr" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          If Fiverr says &ldquo;This phone number can&apos;t be used,&rdquo; press Cancel and
          refund below. You get your money back at once and can try again.
        </p>
      ) : null}

      <div className="mt-6">
        <ActivationPanel
          serviceSlug={activation.serviceSlug}
          serviceName={activation.serviceName}
          serviceColor={activation.serviceColor}
          countryName={activation.countryName}
          phoneNumber={activation.phoneNumber}
          status={activation.status}
          code={activation.code}
          secondsRemaining={remaining}
          createdAt={activation.createdAt}
          receivedAt={activation.receivedAt}
          refundedAmountLabel={priceLabel}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {activation.status === "WAITING"
                  ? `Refunded automatically in ${formatDuration(remaining)} if no code arrives`
                  : activation.status === "RECEIVED"
                    ? `Paid ${priceLabel}`
                    : `Refunded ${priceLabel}`}
              </span>
              {activation.status === "WAITING" ? (
                waitedLong ? null : (
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={pending}
                    className="-my-2 py-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-danger hover:underline disabled:opacity-50"
                  >
                    Cancel and refund
                  </button>
                )
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

      {waitedLong ? (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning">No code yet?</p>
          <p className="mt-1 text-sm text-warning">
            Don&apos;t wait it out. Get your {priceLabel}{" "}
            back to your wallet at once and try another number.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-3 w-full"
            onClick={cancel}
            disabled={pending}
          >
            {pending
              ? "Refunding"
              : `Refund my ${priceLabel}`}
          </Button>
        </div>
      ) : null}

      {noCode && serverTwoPrice ? (
        <div className="mt-4 rounded-2xl border border-mint/40 bg-mint-soft p-4">
          <p className="text-sm font-semibold text-forest">Didn&apos;t get a code? Try Premium</p>
          <p className="mt-1 text-sm text-forest/80">
            Get a new {activation.serviceName} number for {activation.countryName} from Premium.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-3 w-full"
            onClick={buyOnServerTwo}
            disabled={buyingServerTwo}
          >
            {buyingServerTwo ? "Getting your number" : `Buy on Premium · ${serverTwoPrice}`}
          </Button>
          {serverTwoMessage ? <p className="mt-2 text-xs text-danger">{serverTwoMessage}</p> : null}
        </div>
      ) : null}

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
