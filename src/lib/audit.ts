import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The append-only record of admin actions that matter: who did what, to
 * what, and when. Nothing reads this to make a decision; it exists purely
 * so a suspension, deletion, wallet adjustment, email campaign or settings
 * change can be explained after the fact.
 *
 * Never allowed to block the action it is recording: a logging failure
 * here is a bug worth seeing in the server log, not a reason to leave a
 * wallet adjustment half-applied.
 */

export interface AuditActor {
  id: string;
  email: string;
}

export async function recordAudit(entry: {
  actor: AuditActor;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor.id,
        actorEmail: entry.actor.email,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
      },
    });
  } catch (error) {
    console.error(`[audit] failed to record "${entry.action}":`, error);
  }
}
