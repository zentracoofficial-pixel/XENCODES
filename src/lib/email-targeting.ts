import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Who an email campaign can be sent to.
 *
 * Every segment here is something the existing schema can answer exactly:
 * there is no "engagement score" or other figure invented to make the
 * targeting list look richer than the data actually supports. A segment
 * that would need data Xencodes doesn't have (that is not a "sign-in
 * streak", for instance) is deliberately absent rather than approximated.
 */

export type AudienceSegment =
  | { kind: "all" }
  | { kind: "never_purchased" }
  | { kind: "funded_never_purchased" }
  | { kind: "purchased_recently"; days: number }
  | { kind: "not_purchased_recently"; days: number }
  | { kind: "low_balance"; thresholdKobo: number }
  | { kind: "inactive_login"; days: number }
  | { kind: "selected"; userIds: string[] }
  | { kind: "specific_user"; userId: string }
  /// Not a normal campaign segment: resolveAudience() answers it the same
  /// way as any other (the current, canonical set of unverified accounts),
  /// but src/app/admin/email/actions.ts sends to it through
  /// sendVerificationRemindersAction() instead of sendCampaignAction() —
  /// each recipient gets their own token and link via the existing
  /// verification system, never one shared campaign email. See that
  /// function's own comment for why.
  | { kind: "unverified" };

export const AUDIENCE_LABELS: Record<AudienceSegment["kind"], string> = {
  all: "All users",
  never_purchased: "Never purchased",
  funded_never_purchased: "Funded, never purchased",
  purchased_recently: "Purchased recently",
  not_purchased_recently: "Purchased before, not recently",
  low_balance: "Low wallet balance",
  inactive_login: "Haven't logged in recently",
  selected: "Selected users",
  specific_user: "One specific user",
  unverified: "Unverified users",
};

export function describeAudience(segment: AudienceSegment): string {
  switch (segment.kind) {
    case "all":
      return "All users";
    case "never_purchased":
      return "Never purchased";
    case "funded_never_purchased":
      return "Funded their wallet, never purchased";
    case "purchased_recently":
      return `Purchased in the last ${segment.days} days`;
    case "not_purchased_recently":
      return `Purchased before, but not in the last ${segment.days} days`;
    case "low_balance":
      return `Wallet balance below ₦${(segment.thresholdKobo / 100).toLocaleString("en-NG")}`;
    case "inactive_login":
      return `Haven't logged in within ${segment.days} days (or never recorded)`;
    case "selected":
      return `${segment.userIds.length} selected user${segment.userIds.length === 1 ? "" : "s"}`;
    case "specific_user":
      return "One specific user";
    case "unverified":
      return "Unverified users";
  }
}

/**
 * The ids the composer submitted in its `userIds` field, de-duplicated.
 * That one field carries the picked account(s) for both "Selected users"
 * and "One specific user": the composer has no separate single-id field.
 */
function pickedUserIds(formData: FormData): string[] {
  const ids = String(formData.get("userIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * Reads the audience out of the composer's form fields. Lives here rather
 * than beside the server actions because a "use server" module can only
 * export async functions, and this is pure.
 */
export function parseAudienceSegment(formData: FormData): AudienceSegment {
  const kind = String(formData.get("segmentKind") ?? "all") as AudienceSegment["kind"];
  switch (kind) {
    case "purchased_recently":
    case "not_purchased_recently":
    case "inactive_login":
      return { kind, days: Number(formData.get("days")) || 30 };
    case "low_balance":
      return {
        kind,
        thresholdKobo: Math.round((Number(formData.get("thresholdNaira")) || 0) * 100),
      };
    case "selected":
      return { kind, userIds: pickedUserIds(formData) };
    case "specific_user": {
      // Exactly one person or nobody. Anything else (nothing picked yet, or
      // leftovers from an earlier multi-user pick) resolves to an empty
      // audience, which the send path refuses, rather than quietly
      // narrowing to "the first one" and emailing someone the admin did
      // not choose.
      const ids = pickedUserIds(formData);
      return { kind, userId: ids.length === 1 ? ids[0] : "" };
    }
    case "unverified":
      return { kind: "unverified" };
    default:
      return { kind: "all" };
  }
}

/** Base filter every segment shares: a live account with a real inbox. */
const LIVE_USER: Prisma.UserWhereInput = { deletedAt: null, role: "USER" };

async function purchasedUserIds(): Promise<Set<string>> {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: "PURCHASE", status: "SUCCESSFUL" },
    distinct: ["userId"],
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function purchasedSinceUserIds(since: Date): Promise<Set<string>> {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: "PURCHASE", status: "SUCCESSFUL", createdAt: { gte: since } },
    distinct: ["userId"],
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

async function fundedUserIds(): Promise<Set<string>> {
  const rows = await prisma.walletTransaction.findMany({
    where: { type: "TOPUP", status: "SUCCESSFUL" },
    distinct: ["userId"],
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Resolves a segment to the exact set of recipients right now. Used both to
 * show a live count while composing and to build the actual send list, so
 * the number an admin is shown is never anything but what will be used.
 */
export async function resolveAudience(
  segment: AudienceSegment,
): Promise<{ id: string; email: string }[]> {
  switch (segment.kind) {
    case "all":
      return prisma.user.findMany({ where: LIVE_USER, select: { id: true, email: true } });

    case "never_purchased": {
      const purchased = await purchasedUserIds();
      const users = await prisma.user.findMany({
        where: LIVE_USER,
        select: { id: true, email: true },
      });
      return users.filter((u) => !purchased.has(u.id));
    }

    case "funded_never_purchased": {
      const [funded, purchased] = await Promise.all([fundedUserIds(), purchasedUserIds()]);
      const users = await prisma.user.findMany({
        where: { ...LIVE_USER, id: { in: Array.from(funded) } },
        select: { id: true, email: true },
      });
      return users.filter((u) => !purchased.has(u.id));
    }

    case "purchased_recently": {
      const recent = await purchasedSinceUserIds(daysAgo(segment.days));
      return prisma.user.findMany({
        where: { ...LIVE_USER, id: { in: Array.from(recent) } },
        select: { id: true, email: true },
      });
    }

    case "not_purchased_recently": {
      const [everPurchased, recent] = await Promise.all([
        purchasedUserIds(),
        purchasedSinceUserIds(daysAgo(segment.days)),
      ]);
      const stale = Array.from(everPurchased).filter((id) => !recent.has(id));
      return prisma.user.findMany({
        where: { ...LIVE_USER, id: { in: stale } },
        select: { id: true, email: true },
      });
    }

    case "low_balance":
      return prisma.user.findMany({
        where: { ...LIVE_USER, walletBalanceKobo: { lt: segment.thresholdKobo } },
        select: { id: true, email: true },
      });

    case "inactive_login":
      return prisma.user.findMany({
        where: {
          ...LIVE_USER,
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: daysAgo(segment.days) } }],
        },
        select: { id: true, email: true },
      });

    case "selected":
      return prisma.user.findMany({
        where: { ...LIVE_USER, id: { in: segment.userIds } },
        select: { id: true, email: true },
      });

    case "specific_user":
      return prisma.user.findMany({
        where: { ...LIVE_USER, id: segment.userId },
        select: { id: true, email: true },
      });

    // The canonical server-side definition of "unverified" — the exact
    // field every other check in the app reads (the purchase limit, the
    // dashboard banner, /verify-email, adminVerifyUserEmail()). LIVE_USER
    // already excludes deleted accounts and admins; emailVerified: null is
    // the one additional condition. Recomputed fresh at send time, not
    // cached from this count, so a user who verifies in the meantime is not
    // in the list the send loop actually iterates.
    case "unverified":
      return prisma.user.findMany({
        where: { ...LIVE_USER, emailVerified: null },
        select: { id: true, email: true },
      });
  }
}
