import { prisma } from "@/lib/prisma";
import type { NumberProvider } from "@/lib/provider/types";
import { sendEmailSafe } from "@/lib/email";
import { buildCampaignEmailHtml, buildCampaignEmailText } from "@/lib/email-template";
import { SITE_URL, SUPPORT_EMAIL } from "@/lib/site";

/**
 * The GrizzlySMS *supplier* account balance — never a customer's own
 * Xencodes wallet (User.walletBalanceKobo). Confusing the two would be a
 * serious bug: this is what Xencodes owes GrizzlySMS to keep buying numbers
 * from it, not anything a customer holds or is owed.
 *
 * Deliberately wired into the two places that already ask a provider for
 * its balance rather than adding a new poller: the daily catalog-sync cron
 * (runProviderSync in provider-sync.ts) and the admin dashboard's own
 * "provider balance" display (admin/page.tsx). No new outbound request to
 * GrizzlySMS is added anywhere by this file.
 */

const DEFAULT_THRESHOLD_USD = 2;
const DEFAULT_MAX_ALERTS_PER_EPISODE = 3;

function getLowBalanceThresholdUsdCents(): number {
  const raw = Number(process.env.PROVIDER_LOW_BALANCE_THRESHOLD_USD);
  const usd = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_THRESHOLD_USD;
  return Math.round(usd * 100);
}

function getMaxAlertsPerEpisode(): number {
  const raw = Number(process.env.PROVIDER_LOW_BALANCE_MAX_ALERTS_24H);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_MAX_ALERTS_PER_EPISODE;
}

function formatUsdExact(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface ProviderBalanceCheckResult {
  ok: boolean;
  /** Null when the provider doesn't expose a balance, or when the check
   *  failed — never a stand-in for zero. */
  balanceUsdCents: number | null;
  error?: string;
}

async function recordCheckFailure(providerId: string, message: string): Promise<void> {
  // Never touches currentBalanceUsdCents/isLow/lowSince: a failed check
  // leaves the last known-good reading (and any active low-balance warning)
  // standing exactly as it was, rather than guessing zero or silently
  // clearing a real warning because this one check happened to fail.
  console.error(`[provider-balance] "${providerId}" balance check failed:`, message);
  await prisma.providerBalanceStatus
    .upsert({
      where: { id: providerId },
      create: { id: providerId, lastCheckedAt: new Date(), lastCheckError: message },
      update: { lastCheckedAt: new Date(), lastCheckError: message },
    })
    .catch((dbError) => {
      console.error(`[provider-balance] failed to record check failure for "${providerId}":`, dbError);
    });
}

/**
 * Reads the provider's live balance, updates ProviderBalanceStatus, and — if
 * this reading just crossed into or remains within a low-balance episode —
 * sends at most a configured number of admin email alerts spread across
 * that episode. Safe to call as often as the two existing call sites
 * already do; concurrent calls for the same provider are serialized by a
 * Postgres advisory lock so two callers landing at the same moment can
 * never both decide to send the next alert.
 */
export async function checkProviderBalance(
  providerId: string,
  label: string,
  provider: NumberProvider,
): Promise<ProviderBalanceCheckResult> {
  if (typeof provider.getProviderBalanceUsdCents !== "function") {
    return { ok: true, balanceUsdCents: null };
  }

  let balanceUsdCents: number | null;
  try {
    balanceUsdCents = await provider.getProviderBalanceUsdCents();
  } catch (error) {
    // ProviderError (and every error this adapter throws) carries a safe,
    // credential-free message — see grizzlysms.ts's call(), which never
    // includes the request URL or api_key in what it throws.
    const message = error instanceof Error ? error.message : "Unknown error reading provider balance.";
    await recordCheckFailure(providerId, message);
    return { ok: false, balanceUsdCents: null, error: message };
  }

  if (balanceUsdCents === null) {
    const message = "Provider responded without a usable balance figure.";
    await recordCheckFailure(providerId, message);
    return { ok: false, balanceUsdCents: null, error: message };
  }

  await evaluateBalance(providerId, label, balanceUsdCents);
  return { ok: true, balanceUsdCents };
}

async function evaluateBalance(providerId: string, label: string, balanceUsdCents: number): Promise<void> {
  const thresholdCents = getLowBalanceThresholdUsdCents();
  const isLowNow = balanceUsdCents <= thresholdCents;
  const now = new Date();

  const shouldAlert = await prisma.$transaction(async (tx) => {
    // Serializes concurrent checks for this exact provider — a cron run and
    // an admin dashboard load landing at the same moment, say — so only one
    // of them ever gets to decide "send the next alert" and record it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${providerId}))`;

    const existing = await tx.providerBalanceStatus.findUnique({ where: { id: providerId } });

    if (!isLowNow) {
      await tx.providerBalanceStatus.upsert({
        where: { id: providerId },
        create: {
          id: providerId,
          lastCheckedAt: now,
          lastCheckError: null,
          currentBalanceUsdCents: balanceUsdCents,
          isLow: false,
        },
        update: {
          lastCheckedAt: now,
          lastCheckError: null,
          currentBalanceUsdCents: balanceUsdCents,
          isLow: false,
          lowSince: null,
          // Only actually a recovery worth timestamping if it was
          // previously low; otherwise leave any earlier recovery record
          // (or null) exactly as it was.
          recoveredAt: existing?.isLow ? now : existing?.recoveredAt,
        },
      });
      return false;
    }

    // At or below the threshold. A fresh episode (never low before, or the
    // last reading had recovered) starts its own alert count at zero from
    // this moment; a continuing episode keeps counting from when it first
    // went low.
    const isNewEpisode = !existing?.isLow;
    const lowSince = isNewEpisode ? now : (existing?.lowSince ?? now);

    await tx.providerBalanceStatus.upsert({
      where: { id: providerId },
      create: {
        id: providerId,
        lastCheckedAt: now,
        lastCheckError: null,
        currentBalanceUsdCents: balanceUsdCents,
        isLow: true,
        lowSince: now,
      },
      update: {
        lastCheckedAt: now,
        lastCheckError: null,
        currentBalanceUsdCents: balanceUsdCents,
        isLow: true,
        lowSince,
      },
    });

    const maxAlerts = getMaxAlertsPerEpisode();
    const alertsThisEpisode = await tx.providerBalanceAlert.count({
      where: { providerId, sentAt: { gte: lowSince } },
    });
    if (alertsThisEpisode >= maxAlerts) return false;

    // Spreads the episode's alert budget across a day (e.g. 3 alerts ->
    // roughly one every 8 hours) rather than letting several back-to-back
    // checks (three quick admin dashboard reloads, say) burn the whole
    // budget in the same minute.
    const minSpacingMs = (24 * 60 * 60 * 1000) / maxAlerts;
    const lastAlert = await tx.providerBalanceAlert.findFirst({
      where: { providerId },
      orderBy: { sentAt: "desc" },
    });
    if (lastAlert && now.getTime() - lastAlert.sentAt.getTime() < minSpacingMs) return false;

    // Recorded before the email is even attempted: this row, not a
    // successful send, is what makes a concurrent or later check see
    // "already alerted" — a lost email is a smaller problem than a
    // duplicate one.
    await tx.providerBalanceAlert.create({ data: { providerId, balanceUsdCents } });
    return true;
  });

  if (shouldAlert) {
    await sendLowBalanceEmail(label, balanceUsdCents, now).catch((error) => {
      console.error(`[provider-balance] failed to send low-balance email for "${providerId}":`, error);
    });
  }
}

async function sendLowBalanceEmail(label: string, balanceUsdCents: number, detectedAt: Date): Promise<void> {
  const amount = formatUsdExact(balanceUsdCents);
  const message = `${label} balance is low. Current provider credit: ${amount}. Please top up the provider account.`;
  const detectedLabel = `${detectedAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;

  const input = {
    title: `${label} balance is low`,
    body: [
      message,
      `Detected: ${detectedLabel}`,
      "This is the supplier account balance Xencodes pays to buy numbers from — a separate thing from any customer's own wallet, which is unaffected.",
    ].join("\n\n"),
    ctaText: "Open provider settings",
    ctaUrl: `${SITE_URL}/admin/providers`,
    previewText: message,
  };

  await sendEmailSafe({
    to: SUPPORT_EMAIL,
    subject: `${label} balance is low — top-up needed`,
    text: buildCampaignEmailText(input),
    html: buildCampaignEmailHtml(input),
  });
}

export interface ProviderBalanceStatusView {
  currentBalanceUsdCents: number | null;
  lastCheckedAt: Date | null;
  lastCheckError: string | null;
  isLow: boolean;
  lowSince: Date | null;
  recoveredAt: Date | null;
}

/** Read-only, for the admin dashboard's warning banner and system-health
 *  row. Never consulted by the buy flow or shown to a customer. */
export async function getProviderBalanceStatus(providerId: string): Promise<ProviderBalanceStatusView | null> {
  const row = await prisma.providerBalanceStatus.findUnique({ where: { id: providerId } });
  if (!row) return null;
  return {
    currentBalanceUsdCents: row.currentBalanceUsdCents,
    lastCheckedAt: row.lastCheckedAt,
    lastCheckError: row.lastCheckError,
    isLow: row.isLow,
    lowSince: row.lowSince,
    recoveredAt: row.recoveredAt,
  };
}
