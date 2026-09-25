import type { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin: Users" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type StatusFilter = "all" | "active" | "suspended" | "deleted";
type SortKey = "newest" | "oldest" | "balance" | "spent";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All (excl. deleted)" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "balance", label: "Highest balance" },
  { value: "spent", label: "Highest spend" },
];

// A defensive ceiling, not a real page size: ranking by spend needs every
// matching user's id (spend lives in a different table, so Postgres can't
// sort+paginate both in one query without a raw join). Ids are cheap
// (~25 bytes each), so this bounds worst case to roughly 250KB rather than
// the unbounded full-row fetch this replaces. Beyond this many matching
// users, spend-ranking would need a materialized/precomputed column, which
// is a real architecture change or nothing this deployment needs yet.
const MAX_RANKED_IDS = 10_000;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string }>;
}) {
  await requireAdmin();

  const { q, status: statusRaw, sort: sortRaw, page: pageRaw } = await searchParams;
  const query = q?.trim();
  const status: StatusFilter = (
    ["all", "active", "suspended", "deleted"] as const
  ).includes(statusRaw as StatusFilter)
    ? (statusRaw as StatusFilter)
    : "all";
  const sort: SortKey = (["newest", "oldest", "balance", "spent"] as const).includes(
    sortRaw as SortKey,
  )
    ? (sortRaw as SortKey)
    : "newest";
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  const where: Prisma.UserWhereInput = {
    ...(query ? { email: { contains: query, mode: "insensitive" } } : {}),
    ...(status === "active"
      ? { status: "ACTIVE", deletedAt: null }
      : status === "suspended"
        ? { status: "SUSPENDED", deletedAt: null }
        : status === "deleted"
          ? { deletedAt: { not: null } }
          : { deletedAt: null }),
  };

  let rows: (Prisma.UserGetPayload<{ include: { _count: { select: { activations: true } } } }>)[];
  let total: number;
  let spentByUser: Map<string, number>;

  if (sort === "spent") {
    // Spend lives on WalletTransaction, not User, so Postgres can't sort
    // and paginate both tables in one query without a raw join. Only ids
    // are fetched for ranking (bounded by MAX_RANKED_IDS, see above); the
    // full row (with its activation count) is only ever fetched for the
    // PAGE_SIZE ids that actually land on the requested page.
    const idRows = await prisma.user.findMany({
      where,
      select: { id: true },
      take: MAX_RANKED_IDS,
    });
    total = idRows.length;

    const spend = await prisma.walletTransaction.groupBy({
      by: ["userId"],
      where: {
        type: "PURCHASE",
        status: "SUCCESSFUL",
        userId: { in: idRows.map((row) => row.id) },
      },
      _sum: { amountKobo: true },
    });
    spentByUser = new Map(
      spend.map((row) => [row.userId, Math.abs(row._sum.amountKobo ?? 0)]),
    );

    const rankedIds = idRows
      .map((row) => row.id)
      .sort((a, b) => (spentByUser.get(b) ?? 0) - (spentByUser.get(a) ?? 0))
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const pageUsers = await prisma.user.findMany({
      where: { id: { in: rankedIds } },
      include: { _count: { select: { activations: true } } },
    });
    const byId = new Map(pageUsers.map((user) => [user.id, user]));
    rows = rankedIds.map((id) => byId.get(id)!).filter(Boolean);
  } else {
    [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy:
          sort === "oldest"
            ? { createdAt: "asc" }
            : sort === "balance"
              ? { walletBalanceKobo: "desc" }
              : { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { _count: { select: { activations: true } } },
      }),
    ]);

    // Spend is only ever computed for the rows actually shown on this
    // page, one grouped query rather than a lookup per row.
    const spend = await prisma.walletTransaction.groupBy({
      by: ["userId"],
      where: {
        type: "PURCHASE",
        status: "SUCCESSFUL",
        userId: { in: rows.map((user) => user.id) },
      },
      _sum: { amountKobo: true },
    });
    spentByUser = new Map(
      spend.map((row) => [row.userId, Math.abs(row._sum.amountKobo ?? 0)]),
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status !== "all") params.set("status", status);
    if (sort !== "newest") params.set("sort", sort);
    if (targetPage > 1) params.set("page", String(targetPage));
    const search = params.toString();
    return search ? `/admin/users?${search}` : "/admin/users";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total.toLocaleString("en-NG")} matching{query ? ` "${query}"` : ""}
          {totalPages > 1 ? `, page ${page} of ${totalPages}` : ""}.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by email"
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={sort}
          className="h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </form>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No users found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-3 py-2.5 text-right font-medium">Orders</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total spent</th>
                  <th className="px-3 py-2.5 font-medium">Joined</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border last:border-0 hover:bg-background"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="inline-flex min-h-10 items-center font-medium text-foreground hover:text-forest hover:underline"
                      >
                        {user.deletedAt ? (
                          <span className="text-muted-foreground line-through">
                            {user.email}
                          </span>
                        ) : (
                          user.email
                        )}
                      </Link>
                      {user.role === "ADMIN" ? (
                        <ShieldCheck className="ml-1.5 inline h-3.5 w-3.5 text-forest" />
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(user.walletBalanceKobo, user.currency)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {user._count.activations}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(spentByUser.get(user.id) ?? 0, user.currency)}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {user.createdAt.toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          user.deletedAt
                            ? "neutral"
                            : user.status === "ACTIVE"
                              ? "success"
                              : "danger"
                        }
                      >
                        {user.deletedAt ? "DELETED" : user.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Link
            href={pageLink(page - 1)}
            aria-disabled={page <= 1}
            className={cn(
              "inline-flex min-h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium transition-colors",
              page <= 1
                ? "pointer-events-none opacity-40"
                : "hover:border-mint hover:bg-mint-soft",
            )}
          >
            Previous
          </Link>
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <Link
            href={pageLink(page + 1)}
            aria-disabled={page >= totalPages}
            className={cn(
              "inline-flex min-h-9 items-center rounded-lg border border-border px-3.5 text-sm font-medium transition-colors",
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "hover:border-mint hover:bg-mint-soft",
            )}
          >
            Next
          </Link>
        </div>
      ) : null}
    </div>
  );
}
