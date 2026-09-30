import { prisma } from "@/lib/prisma";
import type { AuditActor } from "@/lib/audit";
import { recordAudit, SYSTEM_ACTOR } from "@/lib/audit";
import { SETTLED_STATUSES } from "@/lib/deliverability";
import { getServiceCountries } from "@/lib/inventory";
import { getCurrencyConfig, getDefaultCurrency } from "@/lib/currency-config";
import { sendEmail, EmailDeliveryError } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import type { EmailMessage } from "@/lib/email-template";
import {
  RECOVERY_TEMPLATE_VARIABLES,
  type RecoveryTemplateVariables,
} from "@/lib/recovery-template-vars";
import {
  SETTING_KEYS,
  readSettings,
  readNumber,
  readBoolean,
  DEFAULT_NO_CODE_RECOVERY_THRESHOLD,
  DEFAULT_NO_CODE_RECOVERY_WINDOW_DAYS,
  DEFAULT_NO_CODE_RECOVERY_EMAIL_COOLDOWN_DAYS,
  DEFAULT_NO_CODE_RECOVERY_AUTO_EMAIL_SUBJECT,
  DEFAULT_NO_CODE_RECOVERY_AUTO_EMAIL_BODY,
} from "@/lib/settings";

/**
 * Detecting a customer who keeps buying numbers without ever receiving a
 * code, and the recovery workflow that follows: an admin-visible event,
 * an optional automatic email, and a manual "send a message" action —
 * all driven from the same real Activation history everything else in
 * this codebase already trusts.
 *
 * "No code" here means exactly what SETTLED_STATUSES in
 * src/lib/deliverability.ts already means: an activation that finished
 * (EXPIRED, CANCELLED or REFUNDED) without ever reaching RECEIVED. A
 * purchase that never happened at all — a declined payment, a provider
 * that refused the sale — never creates an Activation row in the first
 * place (see purchaseNumberAction in src/app/dashboard/buy/actions.ts), so
 * it can never be counted here either: this only ever measures "we sold
 * them a number and it did not deliver a code", never a payment failure
 * dressed up as a delivery one. A still-WAITING activation is excluded the
 * same way the deliverability metric excludes it: it has not finished, so
 * it says nothing yet.
 *
 * Evaluated at the exact moment one of a customer's own activations
 * settles (see getActivationStateAction/cancelActivationAction in
 * src/app/dashboard/buy/actions.ts) — not on a schedule, and not by
 * scanning every customer. That is what lets this reuse the codebase's
 * existing "an order just changed state" hook (the same one
 * notifyNumberPurchaseSale already uses for the opposite, success case)
 * instead of adding a new cron job.
 */

export interface NoCodeRecoveryWindowStats {
  purchaseCount: number;
  successCount: number;
  noCodeCount: number;
  affectedServices: string[];
  affectedCountries: string[];
  lastPurchaseAt: Date | null;
  lastNoCodeAt: Date | null;
  /** Whichever service has the most no-code activations in the window —
   *  the one the recommendation and the recovery email are about. Null
   *  only when noCodeCount is 0. */
  mostAffectedServiceSlug: string | null;
  mostAffectedServiceName: string | null;
}

async function computeWindowStats(
  userId: string,
  windowDays: number,
): Promise<NoCodeRecoveryWindowStats> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.activation.findMany({
    where: { userId, status: { in: SETTLED_STATUSES }, createdAt: { gte: since } },
    select: {
      status: true,
      serviceSlug: true,
      serviceName: true,
      countryName: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const affectedServices = new Set<string>();
  const affectedCountries = new Set<string>();
  const noCodeByService = new Map<string, { name: string; count: number }>();
  let successCount = 0;
  let noCodeCount = 0;
  let lastPurchaseAt: Date | null = null;
  let lastNoCodeAt: Date | null = null;

  for (const row of rows) {
    if (!lastPurchaseAt || row.createdAt > lastPurchaseAt) lastPurchaseAt = row.createdAt;
    if (row.status === "RECEIVED") {
      successCount += 1;
      continue;
    }
    noCodeCount += 1;
    affectedServices.add(row.serviceName);
    affectedCountries.add(row.countryName);
    if (!lastNoCodeAt || row.createdAt > lastNoCodeAt) lastNoCodeAt = row.createdAt;
    const entry = noCodeByService.get(row.serviceSlug) ?? { name: row.serviceName, count: 0 };
    entry.count += 1;
    noCodeByService.set(row.serviceSlug, entry);
  }

  let mostAffectedServiceSlug: string | null = null;
  let mostAffectedServiceName: string | null = null;
  let mostAffectedCount = 0;
  for (const [slug, { name, count }] of noCodeByService) {
    if (count > mostAffectedCount) {
      mostAffectedCount = count;
      mostAffectedServiceSlug = slug;
      mostAffectedServiceName = name;
    }
  }

  return {
    purchaseCount: rows.length,
    successCount,
    noCodeCount,
    affectedServices: Array.from(affectedServices),
    affectedCountries: Array.from(affectedCountries),
    lastPurchaseAt,
    lastNoCodeAt,
    mostAffectedServiceSlug,
    mostAffectedServiceName,
  };
}

interface RecoverySettings {
  autoEmailEnabled: boolean;
  threshold: number;
  windowDays: number;
  cooldownDays: number;
  autoEmailSubject: string;
  autoEmailBody: string;
}

export async function getRecoverySettings(): Promise<RecoverySettings> {
  const settings = await readSettings();
  return {
    autoEmailEnabled: readBoolean(settings, SETTING_KEYS.noCodeRecoveryAutoEmailEnabled, false),
    threshold: readNumber(
      settings,
      SETTING_KEYS.noCodeRecoveryThreshold,
      DEFAULT_NO_CODE_RECOVERY_THRESHOLD,
    ),
    windowDays: readNumber(
      settings,
      SETTING_KEYS.noCodeRecoveryWindowDays,
      DEFAULT_NO_CODE_RECOVERY_WINDOW_DAYS,
    ),
    cooldownDays: readNumber(
      settings,
      SETTING_KEYS.noCodeRecoveryEmailCooldownDays,
      DEFAULT_NO_CODE_RECOVERY_EMAIL_COOLDOWN_DAYS,
    ),
    autoEmailSubject:
      settings[SETTING_KEYS.noCodeRecoveryAutoEmailSubject] || DEFAULT_NO_CODE_RECOVERY_AUTO_EMAIL_SUBJECT,
    autoEmailBody:
      settings[SETTING_KEYS.noCodeRecoveryAutoEmailBody] || DEFAULT_NO_CODE_RECOVERY_AUTO_EMAIL_BODY,
  };
}

/**
 * The same centralized ranking every customer-facing picker uses
 * (src/lib/country-recommendation.ts, via getServiceCountries) — never a
 * separate "best country for this customer" score invented here.
 *
 * Deliberately not the same as the buy panel's `recommended` flag: that
 * flag is intentionally only set when there are at least two variants of a
 * country to choose between (recommending the sole option nothing was
 * compared against would not mean anything on a picker). Here there is no
 * picker — just one customer who needs one suggestion — so this takes the
 * best-ranked *non-confirmed-low* country from the same already-sorted
 * list, which is exactly the top choice a customer would see if they
 * opened the picker themselves, whether or not a second variant exists to
 * compare it against.
 *
 * Null when nothing can honestly be suggested: the service is disabled,
 * has no stock anywhere right now, or every available country is
 * confirmed low quality — recommending a country already known to be bad
 * would be worse than recommending none.
 */
async function getRecommendationForService(
  serviceSlug: string,
  currencyCode: string,
): Promise<{ countrySlug: string; countryName: string } | null> {
  const currency = (await getCurrencyConfig(currencyCode)) ?? (await getDefaultCurrency());
  const countries = await getServiceCountries(serviceSlug, currency);
  const best = countries.find((country) => country.qualityTier !== "low");
  if (!best) return null;
  return { countrySlug: best.slug, countryName: best.name };
}

/**
 * Re-evaluates one customer against the current recovery settings and
 * upserts their NoCodeRecoveryStatus row when they meet the threshold.
 * Does nothing when they do not — an existing OPEN row is left exactly as
 * it is rather than being cleared, since dipping below the threshold on a
 * recount is not the same thing as the admin resolving it or the customer
 * actually succeeding (see resolveRecoveryOnSuccess below for that).
 *
 * Safe to call after every settlement: cheap (one indexed query plus, only
 * when the customer is actually over threshold, one inventory lookup for
 * the recommendation) and idempotent.
 */
export async function evaluateNoCodeRecovery(userId: string): Promise<void> {
  const settings = await getRecoverySettings();
  const stats = await computeWindowStats(userId, settings.windowDays);
  if (stats.noCodeCount < settings.threshold) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true, deletedAt: true },
  });
  // A deleted account has nothing left to recover: never open (or keep
  // open) an episode for one.
  if (!user || user.deletedAt) return;

  let recommendation: { countrySlug: string; countryName: string } | null = null;
  if (stats.mostAffectedServiceSlug) {
    try {
      recommendation = await getRecommendationForService(stats.mostAffectedServiceSlug, user.currency);
    } catch (error) {
      // A recommendation lookup failing (e.g. a transient provider error)
      // must never stop the event itself from being recorded — the admin
      // view is still useful without a suggested country.
      console.error(
        `[recovery] recommendation lookup failed for user ${userId}, service ${stats.mostAffectedServiceSlug}:`,
        error,
      );
    }
  }

  const existing = await prisma.noCodeRecoveryStatus.findUnique({ where: { userId } });
  const reopening = existing?.status === "RESOLVED" || existing?.status === "DISMISSED";

  await prisma.noCodeRecoveryStatus.upsert({
    where: { userId },
    create: {
      userId,
      status: "OPEN",
      windowDays: settings.windowDays,
      purchaseCount: stats.purchaseCount,
      successCount: stats.successCount,
      noCodeCount: stats.noCodeCount,
      affectedServices: stats.affectedServices,
      affectedCountries: stats.affectedCountries,
      lastPurchaseAt: stats.lastPurchaseAt ?? new Date(),
      lastNoCodeAt: stats.lastNoCodeAt,
      recommendedServiceSlug: stats.mostAffectedServiceSlug,
      recommendedServiceName: stats.mostAffectedServiceName,
      recommendedCountrySlug: recommendation?.countrySlug ?? null,
      recommendedCountryName: recommendation?.countryName ?? null,
    },
    update: {
      // A fresh episode after a resolved/dismissed one starts clean; an
      // already-OPEN episode just gets its numbers refreshed.
      status: "OPEN",
      windowDays: settings.windowDays,
      purchaseCount: stats.purchaseCount,
      successCount: stats.successCount,
      noCodeCount: stats.noCodeCount,
      affectedServices: stats.affectedServices,
      affectedCountries: stats.affectedCountries,
      lastPurchaseAt: stats.lastPurchaseAt ?? undefined,
      lastNoCodeAt: stats.lastNoCodeAt,
      recommendedServiceSlug: stats.mostAffectedServiceSlug,
      recommendedServiceName: stats.mostAffectedServiceName,
      recommendedCountrySlug: recommendation?.countrySlug ?? null,
      recommendedCountryName: recommendation?.countryName ?? null,
      lastDetectedAt: new Date(),
      ...(reopening ? { firstDetectedAt: new Date(), resolvedAt: null, dismissedAt: null } : {}),
    },
  });

  await maybeSendAutomaticRecoveryEmail(userId, settings);
}

/**
 * Called right after one of a customer's activations settles into
 * RECEIVED. Closes out any open recovery episode for them — "the customer
 * has since successfully received a code" is one of the task's own
 * explicit reasons an automatic email must not go out, and an admin
 * looking at /admin/recovery should not keep seeing someone who has
 * already succeeded since.
 */
export async function resolveRecoveryOnSuccess(userId: string): Promise<void> {
  await prisma.noCodeRecoveryStatus
    .updateMany({
      where: { userId, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date(), lastSuccessAt: new Date() },
    })
    .catch((error) => {
      console.error(`[recovery] failed to auto-resolve for user ${userId}:`, error);
    });
}

// ---------------------------------------------------------------------------
// Template rendering — a strict allow-list, never arbitrary field access.
// The allow-list itself lives in recovery-template-vars.ts (no Prisma/email
// imports) so the admin composer, a client component, can list the
// variable names without bundling this server-only file into the browser.
// ---------------------------------------------------------------------------

export { RECOVERY_TEMPLATE_VARIABLES, type RecoveryTemplateVariables } from "@/lib/recovery-template-vars";

export function renderRecoveryTemplate(template: string, vars: RecoveryTemplateVariables): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, name: string) => {
    const key = name as keyof RecoveryTemplateVariables;
    return RECOVERY_TEMPLATE_VARIABLES.includes(key) ? vars[key] : match;
  });
}

export interface RecoveryCandidate {
  userId: string;
  email: string;
  name: string | null;
  walletBalanceKobo: number;
  currency: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  purchaseCount: number;
  successCount: number;
  noCodeCount: number;
  affectedServices: string[];
  affectedCountries: string[];
  lastPurchaseAt: Date;
  lastNoCodeAt: Date | null;
  lastSuccessAt: Date | null;
  recommendedServiceName: string | null;
  recommendedCountryName: string | null;
  lastEmailedAt: Date | null;
  firstDetectedAt: Date;
  resolvedAt: Date | null;
  dismissedAt: Date | null;
}

function toCandidate(row: {
  userId: string;
  status: string;
  purchaseCount: number;
  successCount: number;
  noCodeCount: number;
  affectedServices: unknown;
  affectedCountries: unknown;
  lastPurchaseAt: Date;
  lastNoCodeAt: Date | null;
  lastSuccessAt: Date | null;
  recommendedServiceName: string | null;
  recommendedCountryName: string | null;
  lastEmailedAt: Date | null;
  firstDetectedAt: Date;
  resolvedAt: Date | null;
  dismissedAt: Date | null;
  user: { email: string; name: string | null; walletBalanceKobo: number; currency: string };
}): RecoveryCandidate {
  return {
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    walletBalanceKobo: row.user.walletBalanceKobo,
    currency: row.user.currency,
    status: row.status as RecoveryCandidate["status"],
    purchaseCount: row.purchaseCount,
    successCount: row.successCount,
    noCodeCount: row.noCodeCount,
    affectedServices: Array.isArray(row.affectedServices) ? (row.affectedServices as string[]) : [],
    affectedCountries: Array.isArray(row.affectedCountries) ? (row.affectedCountries as string[]) : [],
    lastPurchaseAt: row.lastPurchaseAt,
    lastNoCodeAt: row.lastNoCodeAt,
    lastSuccessAt: row.lastSuccessAt,
    recommendedServiceName: row.recommendedServiceName,
    recommendedCountryName: row.recommendedCountryName,
    lastEmailedAt: row.lastEmailedAt,
    firstDetectedAt: row.firstDetectedAt,
    resolvedAt: row.resolvedAt,
    dismissedAt: row.dismissedAt,
  };
}

/** /admin/recovery's main list: customers currently flagged OPEN, worst
 *  (highest no-code count) first. Excludes deleted accounts — nothing
 *  actionable is left to do for one. */
export async function getOpenRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  const rows = await prisma.noCodeRecoveryStatus.findMany({
    where: { status: "OPEN", user: { deletedAt: null } },
    include: { user: { select: { email: true, name: true, walletBalanceKobo: true, currency: true } } },
    orderBy: [{ noCodeCount: "desc" }, { lastDetectedAt: "desc" }],
  });
  return rows.map(toCandidate);
}

/** The resolved/dismissed history, most recent first — kept separate from
 *  the actionable list above so an admin isn't wading through closed
 *  episodes to find who still needs attention. */
export async function getClosedRecoveryCandidates(limit = 50): Promise<RecoveryCandidate[]> {
  const rows = await prisma.noCodeRecoveryStatus.findMany({
    where: { status: { in: ["RESOLVED", "DISMISSED"] } },
    include: { user: { select: { email: true, name: true, walletBalanceKobo: true, currency: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map(toCandidate);
}

export async function getRecoveryCandidate(userId: string): Promise<RecoveryCandidate | null> {
  const row = await prisma.noCodeRecoveryStatus.findUnique({
    where: { userId },
    include: { user: { select: { email: true, name: true, walletBalanceKobo: true, currency: true } } },
  });
  return row ? toCandidate(row) : null;
}

export async function setRecoveryStatus(
  userId: string,
  status: "RESOLVED" | "DISMISSED",
  actor: AuditActor,
): Promise<void> {
  await prisma.noCodeRecoveryStatus.update({
    where: { userId },
    data:
      status === "RESOLVED"
        ? { status, resolvedAt: new Date() }
        : { status, dismissedAt: new Date() },
  });
  await recordAudit({
    actor,
    action: status === "RESOLVED" ? "recovery.resolve" : "recovery.dismiss",
    targetType: "user",
    targetId: userId,
  });
}

function templateVarsFor(input: {
  name: string | null;
  email: string;
  noCodeCount: number;
  successCount: number;
  affectedServices: string[];
  affectedCountries: string[];
  recommendedServiceName: string | null;
  recommendedCountryName: string | null;
}): RecoveryTemplateVariables {
  return {
    first_name: (input.name ?? "there").split(" ")[0],
    email: input.email,
    failed_count: String(input.noCodeCount),
    successful_count: String(input.successCount),
    service: input.recommendedServiceName ?? input.affectedServices[0] ?? "that service",
    country: input.affectedCountries[0] ?? "that country",
    recommended_country: input.recommendedCountryName ?? "a different country",
  };
}

export interface RenderedRecoveryEmail {
  subject: string;
  bodyText: string;
  message: EmailMessage;
}

/** Renders subject/body templates against one candidate's real data —
 *  used both for the admin's "preview before sending" step and as the
 *  last step before an actual send, so the two can never disagree. */
export async function renderRecoveryEmailPreview(
  userId: string,
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<RenderedRecoveryEmail | null> {
  const candidate = await getRecoveryCandidate(userId);
  if (!candidate) return null;
  const vars = templateVarsFor(candidate);
  const subject = renderRecoveryTemplate(subjectTemplate, vars);
  const bodyText = renderRecoveryTemplate(bodyTemplate, vars);
  return {
    subject,
    bodyText,
    message: { subject, title: subject, blocks: [{ type: "text", text: bodyText }] },
  };
}

export interface SendRecoveryEmailResult {
  ok: boolean;
  error?: string;
}

/** The one function that actually sends a recovery email and logs it,
 *  manual or automatic. Never throws: a failed send is recorded, not
 *  propagated, so it can never break whatever settlement or admin action
 *  triggered it. */
async function sendAndLogRecoveryEmail(input: {
  userId: string;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  message: EmailMessage;
  emailType: "MANUAL" | "AUTOMATIC";
  sentByAdmin?: AuditActor;
}): Promise<SendRecoveryEmailResult> {
  const { html, text } = renderEmail(input.message);
  try {
    const { id } = await sendEmail({ to: input.recipientEmail, subject: input.subject, html, text });
    await prisma.recoveryEmailLog.create({
      data: {
        userId: input.userId,
        recipientEmail: input.recipientEmail,
        emailType: input.emailType,
        subject: input.subject,
        bodyText: input.bodyText,
        status: "SENT",
        providerMessageId: id,
        sentByAdminId: input.sentByAdmin?.id,
        sentByAdminEmail: input.sentByAdmin?.email,
      },
    });
    await prisma.noCodeRecoveryStatus.update({
      where: { userId: input.userId },
      data: { lastEmailedAt: new Date() },
    });
    return { ok: true };
  } catch (error) {
    const reason =
      error instanceof EmailDeliveryError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error sending recovery email.";
    console.error(`[recovery] email send failed for user ${input.userId}:`, reason);
    await prisma.recoveryEmailLog
      .create({
        data: {
          userId: input.userId,
          recipientEmail: input.recipientEmail,
          emailType: input.emailType,
          subject: input.subject,
          bodyText: input.bodyText,
          status: "FAILED",
          failureReason: reason,
          sentByAdminId: input.sentByAdmin?.id,
          sentByAdminEmail: input.sentByAdmin?.email,
        },
      })
      .catch((dbError) => {
        console.error(`[recovery] failed to record failed send for user ${input.userId}:`, dbError);
      });
    return { ok: false, error: reason };
  }
}

/**
 * The automatic side, called from evaluateNoCodeRecovery() right after an
 * episode is opened or refreshed. Every one of these is a real,
 * independently-checked reason to stay quiet, per the task's own list:
 * disabled by an admin, the episode is not OPEN (dismissed, or already
 * resolved because a code arrived since), or the last email — manual or
 * automatic, either counts — was inside the cooldown window.
 */
async function maybeSendAutomaticRecoveryEmail(
  userId: string,
  settings: RecoverySettings,
): Promise<void> {
  if (!settings.autoEmailEnabled) return;

  const status = await prisma.noCodeRecoveryStatus.findUnique({
    where: { userId },
    include: { user: { select: { email: true, name: true, deletedAt: true } } },
  });
  if (!status || status.status !== "OPEN" || status.user.deletedAt) return;

  if (status.lastEmailedAt) {
    const cooldownMs = settings.cooldownDays * 24 * 60 * 60 * 1000;
    if (Date.now() - status.lastEmailedAt.getTime() < cooldownMs) return;
  }

  const vars = templateVarsFor({
    name: status.user.name,
    email: status.user.email,
    noCodeCount: status.noCodeCount,
    successCount: status.successCount,
    affectedServices: Array.isArray(status.affectedServices) ? (status.affectedServices as string[]) : [],
    affectedCountries: Array.isArray(status.affectedCountries) ? (status.affectedCountries as string[]) : [],
    recommendedServiceName: status.recommendedServiceName,
    recommendedCountryName: status.recommendedCountryName,
  });
  const subject = renderRecoveryTemplate(settings.autoEmailSubject, vars);
  const bodyText = renderRecoveryTemplate(settings.autoEmailBody, vars);

  await sendAndLogRecoveryEmail({
    userId,
    recipientEmail: status.user.email,
    subject,
    bodyText,
    message: { subject, title: subject, blocks: [{ type: "text", text: bodyText }] },
    emailType: "AUTOMATIC",
  });

  await recordAudit({
    actor: SYSTEM_ACTOR,
    action: "recovery.auto_email",
    targetType: "user",
    targetId: userId,
    metadata: { subject, noCodeCount: status.noCodeCount },
  });
}

/** The manual side: an admin composing from /admin/recovery. Subject/body
 *  are whatever the admin typed (with {{variables}}), rendered against
 *  this exact customer's real data — the same rendering
 *  renderRecoveryEmailPreview used for the preview the admin already saw,
 *  so what is sent can never differ from what was previewed. */
export async function sendManualRecoveryEmail(input: {
  userId: string;
  subjectTemplate: string;
  bodyTemplate: string;
  admin: AuditActor;
}): Promise<SendRecoveryEmailResult> {
  const candidate = await getRecoveryCandidate(input.userId);
  if (!candidate) return { ok: false, error: "No recovery record for this customer." };

  const vars = templateVarsFor(candidate);
  const subject = renderRecoveryTemplate(input.subjectTemplate, vars);
  const bodyText = renderRecoveryTemplate(input.bodyTemplate, vars);

  const result = await sendAndLogRecoveryEmail({
    userId: input.userId,
    recipientEmail: candidate.email,
    subject,
    bodyText,
    message: { subject, title: subject, blocks: [{ type: "text", text: bodyText }] },
    emailType: "MANUAL",
    sentByAdmin: input.admin,
  });

  await recordAudit({
    actor: input.admin,
    action: "recovery.manual_email",
    targetType: "user",
    targetId: input.userId,
    metadata: { subject, ok: result.ok, error: result.error },
  });

  return result;
}

export async function getRecoveryEmailLog(userId: string, limit = 20) {
  return prisma.recoveryEmailLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
