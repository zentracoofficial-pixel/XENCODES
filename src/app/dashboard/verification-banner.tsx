"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import {
  resendVerificationAction,
  requestManualVerificationAction,
  checkVerificationStatusAction,
} from "@/app/(auth)/verify-email/actions";

const POLL_INTERVAL_MS = 20000;

type ManualStatus = "none" | "pending" | "rejected";

/**
 * Only ever rendered by DashboardLayout for an unverified user (see
 * layout.tsx), so there is no "verified" prop to read on mount — it starts
 * visible and hides itself the moment a poll or a resend/manual-request
 * result confirms verification, the same read-only polling pattern the
 * pending-verification screen itself uses. No action here ever sets
 * emailVerified directly; hiding the banner is a client-side render
 * decision, not a write.
 */
export function VerificationBanner({
  initialResendLimitReached,
  initialManualStatus,
}: {
  initialResendLimitReached: boolean;
  initialManualStatus: ManualStatus;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendLimitReached, setResendLimitReached] = useState(initialResendLimitReached);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<ManualStatus>(initialManualStatus);
  const [manualPending, setManualPending] = useState(false);

  useEffect(() => {
    if (verified) return;
    let cancelled = false;

    async function poll() {
      const result = await checkVerificationStatusAction();
      if (!cancelled && result.verified) {
        setVerified(true);
        router.refresh();
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [verified, router]);

  if (verified) return null;

  async function handleResend() {
    setResendPending(true);
    setResendMessage(null);
    try {
      const result = await resendVerificationAction();
      switch (result.status) {
        case "sent":
          setResendMessage("Verification email sent. Check your inbox and spam folder.");
          break;
        case "already_verified":
          setVerified(true);
          router.refresh();
          break;
        case "cooling_down":
          setResendMessage(`You can resend again in ${result.retryAfterSeconds}s.`);
          break;
        case "limit_reached":
          setResendLimitReached(true);
          setResendMessage("You've reached the resend limit. You can request manual verification below.");
          break;
        case "provider_error":
          setResendMessage(result.message);
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
    try {
      const result = await requestManualVerificationAction();
      if (result.status === "created" || result.status === "already_pending") {
        setManualStatus("pending");
      } else if (result.status === "already_verified") {
        setVerified(true);
        router.refresh();
      } else if (result.status === "not_authenticated") {
        router.push("/login");
      }
    } finally {
      setManualPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
      <div className="flex items-start gap-2.5">
        <MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-medium text-warning">
            Verify your email to unlock full Xencodes access.
          </p>
          {resendMessage ? (
            <p className="mt-0.5 text-xs text-warning">{resendMessage}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          href="/verify-email"
          className="inline-flex h-9 items-center rounded-lg border border-warning/40 bg-surface px-3 text-xs font-medium text-warning transition-colors hover:bg-white"
        >
          Verify email
        </Link>
        {!resendLimitReached ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendPending}
            className="inline-flex h-9 items-center rounded-lg border border-warning/40 bg-surface px-3 text-xs font-medium text-warning transition-colors hover:bg-white disabled:opacity-50"
          >
            {resendPending ? "Sending..." : "Resend verification"}
          </button>
        ) : manualStatus === "pending" ? (
          <span className="text-xs text-warning">Manual review pending</span>
        ) : (
          <button
            type="button"
            onClick={handleManualRequest}
            disabled={manualPending}
            className="inline-flex h-9 items-center rounded-lg border border-warning/40 bg-surface px-3 text-xs font-medium text-warning transition-colors hover:bg-white disabled:opacity-50"
          >
            {manualPending ? "Submitting..." : "Request manual verification"}
          </button>
        )}
      </div>
    </div>
  );
}
