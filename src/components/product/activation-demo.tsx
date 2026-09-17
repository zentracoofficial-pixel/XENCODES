"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ActivationPanel } from "@/components/product/activation-panel";
import { brandIcons } from "@/data/brand-icons";

/**
 * A product preview, not a transaction.
 *
 * Runs the real ActivationPanel through the two states a customer sees, so
 * the homepage shows the actual interface rather than a picture of one.
 * Every value below is a placeholder built to be unmistakably one: the
 * number is a masked template, not digits that could be dialled, and the
 * code is rendered as dots rather than a figure someone could try to use.
 * Nothing here is fetched, purchased, or tied to any account.
 */

const WAIT_SECONDS = 9;
const HOLD_SECONDS = 7;
const SESSION_SECONDS = 9 * 60 + 42;

const DEMO_SERVICE_SLUG = "instagram";
const DEMO_SERVICE_NAME = "Instagram";
const DEMO_COUNTRY_NAME = "United States";
/** Deliberately not a real, dialable format: letters where digits would be. */
const DEMO_PHONE_NUMBER = "+1 XXX XXX XXXX";
/** Rendered as dots rather than digits, so it reads as a placeholder even
 *  in the large, bold type real codes use. */
const DEMO_CODE = "••••••";

export function ActivationDemo() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((value) => (value + 1) % (WAIT_SECONDS + HOLD_SECONDS));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const received = elapsed >= WAIT_SECONDS;

  return (
    <div>
      <ActivationPanel
        serviceSlug={DEMO_SERVICE_SLUG}
        serviceName={DEMO_SERVICE_NAME}
        serviceColor={brandIcons[DEMO_SERVICE_SLUG]?.hex ?? "#63756F"}
        countryName={DEMO_COUNTRY_NAME}
        phoneNumber={DEMO_PHONE_NUMBER}
        status={received ? "RECEIVED" : "WAITING"}
        code={received ? DEMO_CODE : null}
        secondsRemaining={SESSION_SECONDS - elapsed}
      />
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        Preview only. This is not a real number, and nothing here is
        connected to your account.
      </p>
    </div>
  );
}
