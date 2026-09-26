import { prisma } from "@/lib/prisma";

/**
 * Cross-account login throttling, by IP address rather than by account.
 *
 * src/lib/login-lockout.ts already stops unlimited guessing against one
 * account, but has no way to notice a credential-stuffing run or an email
 * enumeration sweep spread across many different accounts from the same
 * source — this closes that gap without touching the per-account budget at
 * all, so it never makes a legitimate user's own repeated mistakes lock
 * anyone else out.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 20;
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

export async function isIpRateLimited(ip: string): Promise<boolean> {
  // An IP that could not be determined (local dev, a misconfigured proxy)
  // is never used as a shared bucket — that would rate-limit everyone
  // behind it together under one "unknown" key.
  if (!ip || ip === "unknown") return false;

  const since = new Date(Date.now() - WINDOW_MS);
  const count = await prisma.loginFailure.count({
    where: { ip, createdAt: { gte: since } },
  });
  return count >= MAX_FAILURES_PER_IP;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  if (!ip || ip === "unknown") return;

  await prisma.loginFailure.create({ data: { ip } });

  // Opportunistic pruning instead of a dedicated cron: cheap, and bounded
  // regardless of traffic, since every write has an independent chance to
  // trigger it.
  if (Math.random() < 0.05) {
    await prisma.loginFailure.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - PRUNE_OLDER_THAN_MS) } },
    });
  }
}
