import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { verificationEmail } from "@/lib/email-messages";
import { SITE_URL } from "@/lib/site";
import type { User } from "@/generated/prisma/client";

/**
 * Email verification: tokens, resend limits, and the unverified-account
 * purchase restriction, all in one place so none of the three "10", "24
 * hours" or "how many resends" numbers this file owns end up duplicated or
 * silently drifting apart elsewhere in the app.
 */

/** Whatever object prisma.$transaction's own callback receives. Accepting
 *  this shape (rather than importing a specific generated type name) lets
 *  the purchase-limit check below run either against the plain client or
 *  inside a caller's own transaction, the same pattern creditWallet() in
 *  src/lib/wallet.ts already uses. */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type PrismaLike = typeof prisma | TransactionClient;

// ---------------------------------------------------------------------------
// Email verification tokens
// ---------------------------------------------------------------------------

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Creates a fresh, single-use verification token for one account. Does not
 *  invalidate any earlier unused token for the same user — a customer who
 *  requested two emails and clicks the older one first still gets verified;
 *  both simply stop being usable the moment either one succeeds, because
 *  verifyEmailToken() marks the account itself verified, and every
 *  subsequent attempt (with any token) is then read as "already verified". */
async function createVerificationToken(userId: string): Promise<string> {
  const token = generateToken();
  await prisma.emailVerificationToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
  });
  return token;
}

export type SendVerificationEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "rejected" | "network" };

/** Creates a token and emails the verification link through the branded
 *  template. Used by both signup and the resend action, so there is one
 *  place that decides what the email looks like and one place that records
 *  the token. Unlike sendEmailSafe()'s other callers, the caller here needs
 *  to know whether it actually sent, so the underlying error code is
 *  reported rather than swallowed into a bare boolean. */
export async function sendVerificationEmail(
  user: Pick<User, "id" | "email">,
): Promise<SendVerificationEmailResult> {
  const token = await createVerificationToken(user.id);
  const verifyUrl = verificationUrl(token);

  try {
    await sendEmail({ to: user.email, ...renderEmail(verificationEmail(verifyUrl)) });
    return { ok: true };
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return { ok: false, reason: error.code };
    }
    return { ok: false, reason: "network" };
  }
}

/** SITE_URL already resolves the deployment's real production domain
 *  (NEXT_PUBLIC_SITE_URL) ahead of any Vercel preview/deploy URL — see its
 *  own doc comment in src/lib/site.ts. Reused as-is, not reimplemented. */
function verificationUrl(token: string): string {
  return `${SITE_URL}/verify-email?token=${token}`;
}

export type VerifyTokenResult =
  | { ok: true; alreadyVerified: false }
  | { ok: true; alreadyVerified: true }
  | { ok: false; reason: "missing" | "invalid" | "expired" };

/**
 * Consumes a verification token, server side, exactly once.
 *
 * A token cannot verify a different account than the one it was minted for:
 * userId is fixed on the row at creation and never looked up from anything
 * caller-supplied. Already-used and already-expired are both refused, and
 * an account that got verified by some other token in the meantime (a
 * second email, a manual verification approved in between) is reported as
 * "alreadyVerified" rather than re-running the same update pointlessly or
 * erroring.
 */
export async function verifyEmailToken(token: string | undefined | null): Promise<VerifyTokenResult> {
  if (!token) return { ok: false, reason: "missing" };

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { user: { select: { emailVerified: true } } },
  });
  if (!record) return { ok: false, reason: "invalid" };

  // Already consumed by an earlier visit to this exact link. The account is
  // necessarily verified already (this is the only function that sets
  // usedAt, and it only ever does so in the same breath as emailVerified),
  // so this is not an error state, just a repeat visit.
  if (record.usedAt) return { ok: true, alreadyVerified: true };

  // The account could have been verified since this token was issued by
  // some other path (a different token, a manual verification approval)
  // without this exact token ever being marked used. Same non-error
  // outcome: nothing left to do, and the token still gets marked used below
  // so a stray later click reads as "already verified" too rather than
  // attempting the update again.
  const alreadyVerified = Boolean(record.user.emailVerified);

  if (!alreadyVerified && record.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: alreadyVerified ? undefined : new Date() },
    }),
  ]);

  return { ok: true, alreadyVerified };
}

// ---------------------------------------------------------------------------
// Resend rate limiting
// ---------------------------------------------------------------------------

/** No new counter column: every send this file has ever made is already a
 *  row in EmailVerificationToken, so both the cooldown and the hourly cap
 *  below are computed straight from that table's own createdAt timestamps
 *  rather than a second, separately-maintained count that could drift from
 *  it. */
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_MAX_PER_WINDOW = 5;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

export interface ResendEligibility {
  eligible: boolean;
  /** Seconds until the per-click cooldown clears, 0 once it has. */
  cooldownSecondsRemaining: number;
  /** How many of the last RESEND_WINDOW_MS's sends have already happened. */
  sentInWindow: number;
  limit: number;
  /** True once sentInWindow has reached the hourly cap: the UI should stop
   *  offering "resend" at all and point at manual verification instead,
   *  rather than showing a cooldown that will never actually clear inside
   *  the same window. */
  limitReached: boolean;
}

export async function getResendEligibility(userId: string): Promise<ResendEligibility> {
  const windowStart = new Date(Date.now() - RESEND_WINDOW_MS);
  const recent = await prisma.emailVerificationToken.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const sentInWindow = recent.length;
  const limitReached = sentInWindow >= RESEND_MAX_PER_WINDOW;

  const lastSentAt = recent[0]?.createdAt;
  const cooldownSecondsRemaining = lastSentAt
    ? Math.max(0, RESEND_COOLDOWN_SECONDS - Math.floor((Date.now() - lastSentAt.getTime()) / 1000))
    : 0;

  return {
    eligible: !limitReached && cooldownSecondsRemaining === 0,
    cooldownSecondsRemaining,
    sentInWindow,
    limit: RESEND_MAX_PER_WINDOW,
    limitReached,
  };
}

export type ResendVerificationResult =
  | { status: "sent"; cooldownSeconds: number }
  | { status: "already_verified" }
  | { status: "cooling_down"; retryAfterSeconds: number }
  | { status: "limit_reached" }
  | { status: "provider_error"; message: string }
  | { status: "not_authenticated" };

/**
 * The actual resend, gated by getResendEligibility() above. Never reports
 * "sent" unless sendVerificationEmail() itself reported success: the UI
 * this backs must not be able to tell a customer an email is on its way
 * when the provider actually rejected it or isn't configured at all.
 */
export async function resendVerificationEmail(user: User): Promise<ResendVerificationResult> {
  if (user.emailVerified) return { status: "already_verified" };

  const eligibility = await getResendEligibility(user.id);
  if (eligibility.limitReached) return { status: "limit_reached" };
  if (eligibility.cooldownSecondsRemaining > 0) {
    return { status: "cooling_down", retryAfterSeconds: eligibility.cooldownSecondsRemaining };
  }

  const result = await sendVerificationEmail(user);
  if (!result.ok) {
    const message =
      result.reason === "not_configured"
        ? "Email delivery is not configured on this deployment yet."
        : result.reason === "network"
          ? "Could not reach the email provider. Please try again shortly."
          : "The email provider rejected the message.";
    return { status: "provider_error", message };
  }

  return { status: "sent", cooldownSeconds: RESEND_COOLDOWN_SECONDS };
}

// ---------------------------------------------------------------------------
// Unverified-account purchase limit
// ---------------------------------------------------------------------------

const DEFAULT_UNVERIFIED_DAILY_PURCHASE_LIMIT = 10;
const UNVERIFIED_PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Configurable via UNVERIFIED_DAILY_PURCHASE_LIMIT rather than a number
 *  written into the purchase flow itself; falls back to 10 for any
 *  deployment that hasn't set it, or set it to something nonsensical. */
export function getUnverifiedDailyPurchaseLimit(): number {
  const raw = Number(process.env.UNVERIFIED_DAILY_PURCHASE_LIMIT);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_UNVERIFIED_DAILY_PURCHASE_LIMIT;
}

/**
 * How many purchases this user has actually completed in the last rolling
 * 24 hours, counted from Activation rows.
 *
 * This is exactly "successful purchases" with no separate bookkeeping
 * needed: purchaseNumberAction() in src/app/dashboard/buy/actions.ts only
 * ever creates an Activation row once the supplier has actually assigned a
 * number and the wallet has actually been debited, inside one transaction.
 * A quote that failed, a provider that was out of stock, an insufficient
 * balance, a price that changed — none of those create a row here, so none
 * of them can ever count against this limit.
 *
 * Accepts an optional transaction client so the real, race-safe enforcement
 * in the purchase flow can run this same count inside the same transaction
 * (behind an advisory lock) that goes on to create the row, rather than
 * this file and the purchase flow maintaining two different counts that
 * could disagree.
 */
export async function countRecentSuccessfulPurchases(
  userId: string,
  client: PrismaLike = prisma,
): Promise<number> {
  return client.activation.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - UNVERIFIED_PURCHASE_WINDOW_MS) } },
  });
}

// ---------------------------------------------------------------------------
// Manual verification requests
// ---------------------------------------------------------------------------

export type ManualVerificationRequestResult =
  | { status: "created" }
  | { status: "already_pending" }
  | { status: "already_verified" };

/**
 * Records a customer's own request for an admin to verify them by hand.
 *
 * Race-safe against a double-click or two open tabs by construction, not by
 * a check-then-insert: manual_verification_requests_one_pending_per_user
 * (a partial unique index on userId where status = 'PENDING', added in the
 * migration alongside this table) is what Postgres itself refuses a second
 * insert against, and the P2002 that raises is read here as "already
 * pending" rather than allowed to bubble up as a raw error.
 */
export async function requestManualVerification(
  user: User,
  reason?: string,
): Promise<ManualVerificationRequestResult> {
  if (user.emailVerified) return { status: "already_verified" };

  try {
    await prisma.manualVerificationRequest.create({
      data: { userId: user.id, reason: reason?.trim() || null },
    });
    return { status: "created" };
  } catch (error) {
    const isUniqueViolation =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (isUniqueViolation) return { status: "already_pending" };
    throw error;
  }
}
