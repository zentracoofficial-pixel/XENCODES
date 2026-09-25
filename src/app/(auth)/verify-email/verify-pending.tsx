"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  resendVerificationAction,
  requestManualVerificationAction,
  checkVerificationStatusAction,
} from "./actions";

const AUTO_REDIRECT_SECONDS = 5;
const POLL_INTERVAL_MS = 4000;

type ManualStatus = "none" | "pending" | "rejected";

/**
 * The screen a customer lands on right after signup, and returns to from
 * the dashboard banner. Nothing here ever sets emailVerified itself —
 * every path that can make `verified` true below is either a server read
 * (the polling action, which only reads the DB) or a result object handed
 * back from a server action that already did the writing (resend,
 * manual-verification). The 5-second auto-redirect in particular only ever
 * calls router.push(); it never touches verification state.
 */
export function VerifyPendingScreen({
  email,
  initialCooldownSeconds,
  initialLimitReached,
  initialManualStatus,
}: {
  email: string;
  initialCooldownSeconds: number;
  initialLimitReached: boolean;
  initialManualStatus: ManualStatus;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [redirectIn, setRedirectIn] = useState(AUTO_REDIRECT_SECONDS);

  const [resendCooldown, setResendCooldown] = useState(initialCooldownSeconds);
  const [resendLimitReached, setResendLimitReached] = useState(initialLimitReached);
  const [resendPending, setResendPending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState(false);

  const [manualStatus, setManualStatus] = useState<ManualStatus>(initialManualStatus);
  const [manualPending, setManualPending] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  const redirectedRef = useRef(false);
  const goToDashboard = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.push("/dashboard");
  }, [router]);

  // The 5-second fallback: continuing to the dashboard is always available,
  // it just doesn't wait forever on this screen. Skipped once verified,
  // since the "verified" branch below redirects on its own, sooner.
  useEffect(() => {
    if (verified) return;
    if (redirectIn <= 0) {
      goToDashboard();
      return;
    }
    const id = setTimeout(() => setRedirectIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [redirectIn, verified, goToDashboard]);

  // Cross-tab / cross-device detection: a link clicked in another tab (or
  // on another device, e.g. a phone) updates the database, not this tab's
  // React state, so this tab has to go ask. Polled on an interval and also
  // immediately whenever the tab regains focus, so switching back after
  // clicking the email link elsewhere reflects it without waiting out the
  // interval.
  useEffect(() => {
    if (verified) return;
    let cancelled = false;

    async function poll() {
      const result = await checkVerificationStatusAction();
      if (!cancelled && result.verified) {
        setVerified(true);
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [verified]);

  // Once verified, there's nothing left for this screen to do: hand off to
  // the dashboard almost immediately rather than making the customer click
  // through after already seeing confirmation.
  useEffect(() => {
    if (!verified) return;
    const id = setTimeout(goToDashboard, 1200);
    return () => clearTimeout(id);
  }, [verified, goToDashboard]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function handleResend() {
    setResendPending(true);
    setResendMessage(null);
    setResendError(false);
    try {
      const result = await resendVerificationAction();
      switch (result.status) {
        case "sent":
          setResendMessage("Verification email sent. Check your inbox and spam folder.");
          setResendCooldown(result.cooldownSeconds);
          break;
        case "already_verified":
          setVerified(true);
          break;
        case "cooling_down":
          setResendCooldown(result.retryAfterSeconds);
          break;
        case "limit_reached":
          setResendLimitReached(true);
          setResendMessage("You've reached the resend limit. You can request manual verification below.");
          setResendError(true);
          break;
        case "provider_error":
          setResendMessage(result.message);
          setResendError(true);
          break;
        case "not_authenticated":
          router.push("/login");
          break;
      }
    } finally {
      setResendPending(false);
    }
  }

  async function handleManualRequest() {
    setManualPending(true);
    setManualMessage(null);
    try {
      const result = await requestManualVerificationAction();
      switch (result.status) {
        case "created":
          setManualStatus("pending");
          setManualMessage("Your manual verification request has been submitted. An administrator will review your account.");
          break;
        case "already_pending":
          setManualStatus("pending");
          setManualMessage("You already have a manual verification request pending review.");
          break;
        case "already_verified":
          setVerified(true);
          break;
        case "not_authenticated":
          router.push("/login");
          break;
      }
    } finally {
      setManualPending(false);
    }
  }

  if (verified) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <MailCheck className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Email verified</p>
        <p className="text-sm text-muted-foreground">
          Taking you to your dashboard...
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint-soft text-forest">
          <MailCheck className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Verify your email</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your account has been created. Please verify your email address to
          unlock full account access.
        </p>
        <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm font-medium">
          {email}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        <Button
          type="button"
          onClick={handleResend}
          disabled={resendPending || resendCooldown > 0 || resendLimitReached}
          className="w-full"
        >
          {resendPending
            ? "Sending..."
            : resendLimitReached
              ? "Resend limit reached"
              : resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Resend verification email"}
        </Button>

        {resendMessage ? (
          <p className={`text-center text-sm ${resendError ? "text-danger" : "text-muted-foreground"}`}>
            {resendMessage}
          </p>
        ) : null}

        <div className="border-t border-border pt-3 text-center">
          {manualStatus === "pending" ? (
            <p className="text-sm text-muted-foreground">
              Your manual verification request has been submitted. An
              administrator will review your account.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleManualRequest}
                disabled={manualPending}
                className="text-sm font-medium text-forest hover:underline disabled:opacity-50"
              >
                {manualPending ? "Submitting..." : "Request manual verification"}
              </button>
              {manualStatus === "rejected" ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Your previous request wasn&apos;t approved. You can submit a
                  new one.
                </p>
              ) : null}
            </>
          )}
          {manualMessage && manualStatus !== "pending" ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{manualMessage}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-1.5 border-t border-border pt-5">
        <Button type="button" variant="outline" onClick={goToDashboard} className="w-full">
          Go to dashboard
        </Button>
        <p className="text-xs text-muted-foreground">
          Continuing automatically in {redirectIn}s. You can use Xencodes now
          — a temporary purchase limit applies until you verify.
        </p>
      </div>
    </Card>
  );
}
