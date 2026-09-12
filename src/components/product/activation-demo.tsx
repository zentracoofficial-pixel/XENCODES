"use client";

import { useEffect, useState } from "react";
import { ActivationPanel } from "@/components/product/activation-panel";

/**
 * Runs the real activation panel through the two states a customer sees, so
 * the homepage shows the actual interface working rather than a screenshot.
 * Clearly labelled as an example by the caller.
 */

const WAIT_SECONDS = 9;
const HOLD_SECONDS = 7;
const SESSION_SECONDS = 9 * 60 + 42;

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
    <ActivationPanel
      serviceSlug="instagram"
      serviceName="Instagram"
      serviceColor="#FF0069"
      countryName="United States"
      flag="🇺🇸"
      phoneNumber="+1 415 555 0142"
      status={received ? "RECEIVED" : "WAITING"}
      code={received ? "482931" : null}
      secondsRemaining={SESSION_SECONDS - elapsed}
    />
  );
}
