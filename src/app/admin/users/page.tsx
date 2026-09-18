import type { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  await requireAdmin();

  const { q, status: statusRaw, sort: sortRaw } = await searchParams;
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

  // Sorting by spend happens after the grouped spend query below, since
  // Prisma cannot order by an aggregate from a different table in one call.
  const users = await prisma.user.findMany({
    where,
    orderBy:
      sort === "oldest"
        ? { createdAt: "asc" }
        : sort === "balance"
          ? { walletBalanceKobo: "desc" }
          : { createdAt: "desc" },
    take: sort === "spent" ? undefined : PAGE_SIZE,
    include: { _count: { select: { activations: true } } },
  });

  // One grouped query for the whole page rather than a spend lookup per
  // row. Purchases only: a refund returns money, so netting it off would
  // understate what a customer has actually bought.
  const spend = await prisma.walletTransaction.groupBy({
    by: ["userId"],
    where: {
      type: "PURCHASE",
      status: "SUCCESSFUL",
      userId: { in: users.map((user) => user.id) },
    },
    _sum: { amountKobo: true },
  });
  const spentByUser = new Map(
    spend.map((row) => [row.userId, Math.abs(row._sum.amountKobo ?? 0)]),
  );

  const rows =
    sort === "spent"
      ? [...users]
          .sort(
            (a, b) => (spentByUser.get(b.id) ?? 0) - (spentByUser.get(a.id) ?? 0),
          )
          .slice(0, PAGE_SIZE)
      : users;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} shown{query ? ` matching "${query}"` : ""}.
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
                      {formatNaira(user.walletBalanceKobo)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {user._count.activations}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatNaira(spentByUser.get(user.id) ?? 0)}
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
    </div>
  );
}
