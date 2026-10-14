import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { isKnownCountry } from "@/lib/countries";
import { normalizeCountryCode } from "@/lib/currency-meta";

/** How many times a customer may change their own country in 24 hours. */
export const COUNTRY_CHANGES_PER_DAY = 5;

export type CountryChangeResult =
  | { ok: true; country: string; changed: boolean }
  | { ok: false; error: "invalid_country" | "too_many_changes" | "not_found" };

/**
 * A customer changing their own country. The country only sets defaults
 * (their starting display currency and the suggested payment currency), so it
 * is theirs to change, within a daily limit so it cannot be flipped
 * endlessly. The write is a compare-and-swap on the old value, so the audit
 * trail's before/after always matches what actually changed even when two
 * requests race.
 */
export async function changeOwnCountry(
  user: { id: string; email: string },
  requested: string,
  nowMs: number = Date.now(),
): Promise<CountryChangeResult> {
  const iso2 = normalizeCountryCode(requested);
  if (!iso2 || !isKnownCountry(iso2)) return { ok: false, error: "invalid_country" };

  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { country: true } });
  if (!current) return { ok: false, error: "not_found" };
  if (current.country === iso2) return { ok: true, country: iso2, changed: false };

  const recent = await prisma.auditLog.count({
    where: {
      targetId: user.id,
      action: "user.country.self_update",
      createdAt: { gte: new Date(nowMs - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent >= COUNTRY_CHANGES_PER_DAY) return { ok: false, error: "too_many_changes" };

  const swapped = await prisma.user.updateMany({
    where: { id: user.id, country: current.country },
    data: { country: iso2 },
  });
  if (swapped.count !== 1) {
    // Changed by another request in between: report what is there now.
    const latest = await prisma.user.findUnique({ where: { id: user.id }, select: { country: true } });
    return { ok: true, country: latest?.country ?? iso2, changed: false };
  }

  await recordAudit({
    actor: { id: user.id, email: user.email },
    action: "user.country.self_update",
    targetType: "user",
    targetId: user.id,
    metadata: { before: current.country, after: iso2 },
  });
  return { ok: true, country: iso2, changed: true };
}
