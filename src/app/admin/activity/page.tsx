import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { ACTIVITY_KINDS, getRecentActivity, type ActivityKind } from "@/lib/admin-activity";

export const metadata: Metadata = { title: "Admin: Recent activity" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Everything that has happened on Xencodes, newest first, with no cut-off:
 * the dashboard shows only the latest handful, this pages back through all of
 * it. Read-only, and separate from the Activity log, which records what
 * admins themselves have done.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; before?: string }>;
}) {
  await requireAdmin();
  const { kind, before: beforeParam } = await searchParams;

  const activeKind = ACTIVITY_KINDS.find((k) => k.value === kind)?.value as ActivityKind | undefined;
  const beforeDate = beforeParam ? new Date(beforeParam) : undefined;
  const before = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;

  const rows = await getRecentActivity({
    kinds: activeKind ? [activeKind] : undefined,
    before,
    limit: PAGE_SIZE,
  });
  const olderCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1].at.toISOString() : null;

  function href(overrides: { kind?: string; before?: string }) {
    const params = new URLSearchParams();
    const nextKind = "kind" in overrides ? overrides.kind : activeKind;
    if (nextKind) params.set("kind", nextKind);
    if (overrides.before) params.set("before", overrides.before);
    const query = params.toString();
    return query ? `/admin/activity?${query}` : "/admin/activity";
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
      active
        ? "border-forest bg-forest text-white"
        : "border-border bg-surface text-muted-foreground hover:bg-background hover:text-foreground",
    );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recent activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything happening across Xencodes, newest first. Open any row for the full record.
        </p>
      </div>

      <nav aria-label="Filter by kind" className="flex flex-wrap gap-2">
        <Link href={href({ kind: undefined })} className={chip(!activeKind)}>
          All
        </Link>
        {ACTIVITY_KINDS.map((k) => (
          <Link key={k.value} href={href({ kind: k.value })} className={chip(activeKind === k.value)}>
            {k.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {before ? "Nothing older than this." : "Nothing has happened yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                    <time className="mt-0.5 block text-xs text-muted-foreground sm:hidden">
                      {row.at.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </time>
                  </div>
                  <time className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {row.at.toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                  <Badge variant={row.badge.variant}>{row.badge.label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        {before ? (
          <Link href={href({})} className="text-sm font-medium text-forest underline-offset-4 hover:underline">
            Back to newest
          </Link>
        ) : (
          <span />
        )}
        {olderCursor ? (
          <Link
            href={href({ before: olderCursor })}
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-background"
          >
            Older activity
          </Link>
        ) : null}
      </div>
    </div>
  );
}
