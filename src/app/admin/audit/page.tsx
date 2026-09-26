import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Admin: Activity log" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * A read-only view of AuditLog (src/lib/audit.ts) — every admin action that
 * already calls recordAudit() (user suspend/delete, wallet adjustments,
 * provider/settings/currency changes, manual verification decisions,
 * support replies, email campaigns) shows up here automatically. This page
 * adds no new recording of its own; it only reads what already exists.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  await requireAdmin();
  const { page: pageParam, action } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const where = action ? { action } : {};

  const [rows, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function keep(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every admin action that changes something important — who did it, what it affected, and
          when. Append-only: nothing here is ever edited or removed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={keep({ action: undefined, page: undefined })}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium",
            !action ? "border-forest bg-mint-soft text-forest" : "border-border text-muted-foreground",
          )}
        >
          All actions
        </Link>
        {actions.map((row) => (
          <Link
            key={row.action}
            href={keep({ action: row.action, page: undefined })}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium",
              action === row.action
                ? "border-forest bg-mint-soft text-forest"
                : "border-border text-muted-foreground",
            )}
          >
            {row.action}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.action}</p>
                  <time className="text-xs text-muted-foreground">
                    {row.createdAt.toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.actorEmail} · {row.targetType}
                  {row.targetId ? ` #${row.targetId}` : ""}
                </p>
                {row.metadata ? (
                  <pre className="mt-1.5 overflow-x-auto rounded-lg bg-background px-3 py-2 text-[11px] text-muted-foreground">
                    {JSON.stringify(row.metadata)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Link
            href={keep({ page: String(page - 1) })}
            aria-disabled={page <= 1}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5",
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-mint-soft",
            )}
          >
            Previous
          </Link>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Link
            href={keep({ page: String(page + 1) })}
            aria-disabled={page >= totalPages}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5",
              page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-mint-soft",
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}
