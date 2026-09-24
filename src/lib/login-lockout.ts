import { prisma } from "@/lib/prisma";

/**
 * Per-account brute-force protection for the password and TOTP checks.
 *
 * Neither check had any throttling before this: a script with a leaked
 * email could guess passwords indefinitely, and a script holding a valid
 * (but not yet TOTP-verified) two-factor ticket could guess a 6-digit code
 * indefinitely inside its 5-minute window. This closes both with one
 * shared counter per account, since both are the same underlying risk (an
 * attacker trying to get into one account) rather than two separate
 * budgets to exhaust independently.
 *
 * Deliberately simple and DB-backed rather than introducing an external
 * rate-limiting service: this stops unlimited automated guessing against a
 * known account, which is the severe part of "no rate limiting." It does
 * not throttle registration or password-reset requests by IP, which would
 * need shared infrastructure (Vercel's own Attack Challenge Mode, or an
 * external store) this deployment does not have configured; that is a
 * separate, lower-severity gap (email spam / CPU cost, not account
 * takeover) left for a deliberate infra decision rather than guessed at
 * here.
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function isLockedOut(user: { lockedUntil: Date | null }): boolean {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

/** How many minutes remain on an active lock, rounded up so "0 minutes"
 *  never displays while a lock is still actually in effect. */
export function lockoutMinutesRemaining(user: { lockedUntil: Date | null }): number {
  if (!user.lockedUntil) return 0;
  const ms = user.lockedUntil.getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/**
 * Records one more wrong guess and locks the account once the threshold is
 * crossed. The counter itself is an atomic increment (safe under
 * concurrent wrong guesses); the lock is set in a follow-up write, which
 * can harmlessly run twice under a genuine race without causing any
 * incorrect behaviour (setting the same kind of lock twice is a no-op in
 * effect).
 */
export async function registerFailedAttempt(userId: string): Promise<void> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) },
    });
  }
}

/** Called on any successful password or TOTP check, so a legitimate sign-in
 *  clears whatever count a mistyped attempt or two had built up. */
export async function clearFailedAttempts(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}
