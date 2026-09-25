"use server";

import { getActiveUser } from "@/lib/session";
import {
  resendVerificationEmail,
  requestManualVerification,
  type ResendVerificationResult,
  type ManualVerificationRequestResult,
} from "@/lib/verification";

/**
 * Called directly (not as a <form> action) from the pending-verification
 * screen's client component, the same way any other dashboard mutation
 * calls getActiveUser() rather than trusting session.user.id alone: a
 * session cookie surviving a suspension or deletion must not be able to
 * trigger a resend or a manual-verification request either.
 */
export async function resendVerificationAction(): Promise<ResendVerificationResult> {
  const user = await getActiveUser();
  if (!user) return { status: "not_authenticated" };
  return resendVerificationEmail(user);
}

export async function requestManualVerificationAction(): Promise<
  ManualVerificationRequestResult | { status: "not_authenticated" }
> {
  const user = await getActiveUser();
  if (!user) return { status: "not_authenticated" };
  return requestManualVerification(user);
}

/**
 * Polled from the client every few seconds, and on tab focus, so a link
 * clicked in another tab (or on another device) is reflected here without
 * the customer having to do anything — including the read-only case where
 * the account was suspended or deleted in the meantime, which just reads
 * as "not verified" rather than throwing.
 */
export async function checkVerificationStatusAction(): Promise<{ verified: boolean }> {
  const user = await getActiveUser();
  return { verified: Boolean(user?.emailVerified) };
}
