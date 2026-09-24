import type { Metadata } from "next";
import Link from "next/link";
import { Search, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { WALLET_STATUS_VARIANT } from "@/lib/wallet-status";
import { isUnverifiedTopup } from "@/lib/funding";
import type {
  Prisma,
  WalletTransactionType,
  WalletTransactionStatus,
} from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin: Wallet" };

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * One ledger for every movement of customer money.
 *
 * Funding, purchases, refunds and adjustments are the same kind of record
 * seen through different filters, so they are one page rather than three.
 * Nothing here changes a balance: balances move only through backend logic
 * (a verified payment, a purchase, a refund, or an adjustment recorded on
 * the customer's own page with a reason attached).
 */

const TYPE_FILTERS: { label: string; value: WalletTransactionType | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Funding", value: "TOPUP" },
  { label: "Purchases", value: "PURCHASE" },
  { label: "Refunds", value: "REFUND" },
  { label: "Adjustments", value: "ADJUSTMENT" },
];

const STATUS_FILTERS: {
  label: string;
  value: WalletTransactionStatus | "ALL";
}[] = [
  { label: "Any status", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Successful", value: "SUCCESSFUL" },
  { label: "Failed", value: "FAILED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default async function AdminWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string; includeDeleted?: string }>;
}) {
  await requireAdmin();

  const { type, status, q, includeDeleted } = await searchParams;
  const activeType = TYPE_FILTERS.find((f) => f.value === type)?.value ?? "ALL";
  // Defaults to only successful money, not "ALL": a pending, failed or
  // cancelled top-up attempt is not money the business has, and showing it
  // by default is exactly what made this ledger look inflated. "Any
  // status" is still one click away for reconciling a specific problem.
  const activeStatus = STATUS_FILTERS.find((f) => f.value === status)?.value ?? "SUCCESSFUL";
  const query = q?.trim();
  const showDeleted = includeDeleted === "1";

  const where: Prisma.WalletTransactionWhereInput = {
    ...(activeType === "ALL" ? {} : { type: activeType }),
    ...(activeStatus === "ALL" ? {} : { status: activeStatus }),
    // A deleted account's own past transactions are kept for financial
    // records (see deleteUserAction in admin/users/actions.ts), but that is
    // not the same as wanting them cluttering ordinary browsing here.
    // Hidden by default; the toggle below still reaches them when needed.
    ...(showDeleted ? {} : { user: { deletedAt: null } }),
    ...(query
      ? {
          OR: [
            { providerReference: query },
            { providerTransactionId: query },
            { user: { email: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [transactions, count, fundedAgg, pendingAgg, unverifiedCount] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: { user: { select: { email: true } } },
    }),
    prisma.walletTransaction.count({ where }),
    // Confirmed money in. A pending top up is money asked for, not
    // received, and counting it here would overstate what Xencodes holds.
    prisma.walletTransaction.aggregate({
      where: { type: "TOPUP", status: "SUCCESSFUL" },
      _sum: { amountKobo: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "TOPUP", status: "PENDING" },
      _sum: { amountKobo: true },
      _count: true,
    }),
    // A SUCCESSFUL top up with no provider transaction id: the current
    // architecture cannot produce one, so any that exist predate it. See
    // isUnverifiedTopup() in src/lib/funding.ts.
    prisma.walletTransaction.count({
      where: { type: "TOPUP", status: "SUCCESSFUL", providerTransactionId: null },
    }),
  ]);

  const link = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      type: activeType === "ALL" ? undefined : activeType,
      // Always explicit, never omitted: the default here is SUCCESSFUL, not
      // ALL, so dropping the param when it's ALL would silently revert an
      // admin's deliberate "show everything" choice back to the default the
      // next time any other link on this page is followed.
      status: activeStatus,
      q: query,
      includeDeleted: showDeleted ? "1" : undefined,
      ...extra,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const search = params.toString();
    return search ? `/admin/wallet?${search}` : "/admin/wallet";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer funding, purchases and refunds.{" "}
          {formatNaira(fundedAgg._sum.amountKobo ?? 0)} received in confirmed
          payments
          {pendingAgg._count > 0
            ? `, with ${pendingAgg._count} funding ${pendingAgg._count === 1 ? "request" : "requests"} worth ${formatNaira(pendingAgg._sum.amountKobo ?? 0)} still awaiting payment.`
            : "."}
        </p>
      </div>

      {unverifiedCount > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {unverifiedCount} successful funding{" "}
            {unverifiedCount === 1 ? "record has" : "records have"} no KoraPay
            transaction behind {unverifiedCount === 1 ? "it" : "them"} — the
            current architecture cannot create one of these, so they predate
            it. Marked with{" "}
            <AlertTriangle className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
            below; open one to review and void it.
          </span>
        </div>
      ) : null}

      <form className="relative max-w-md">
        {activeType === "ALL" ? null : (
          <input type="hidden" name="type" value={activeType} />
        )}
        <input type="hidden" name="status" value={activeStatus} />
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by email or payment reference"
          className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={link({ type: filter.value === "ALL" ? undefined : filter.value })}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
              activeType === filter.value
                ? "border-forest bg-primary text-white"
                : "border-border text-muted-foreground hover:bg-mint-soft",
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={link({ status: filter.value })}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
                activeStatus === filter.value
                  ? "bg-mint-soft text-forest"
                  : "text-muted-foreground hover:bg-mint-soft",
              )}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        <Link
          href={link({ includeDeleted: showDeleted ? undefined : "1" })}
          className="text-xs text-muted-foreground hover:text-forest hover:underline"
        >
          {showDeleted ? "Hide deleted accounts" : "Show deleted accounts"}
        </Link>
      </div>

      <Card className="overflow-hidden">
        {transactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No transactions match this search.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Currency</th>
                  <th className="px-3 py-2.5 font-medium">Provider</th>
                  <th className="px-3 py-2.5 font-medium">Reference</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const settled = tx.status === "SUCCESSFUL";
                  const unverified = isUnverifiedTopup(tx);
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-border last:border-0 hover:bg-background"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/wallet/${tx.id}`}
                          className="block max-w-[15rem] truncate font-medium hover:text-forest"
                        >
                          {tx.user.email}
                        </Link>
                        <span className="block max-w-[15rem] truncate text-xs text-muted-foreground">
                          {tx.description}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {tx.type}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right font-semibold tabular-nums",
                          !settled
                            ? "text-muted-foreground"
                            : tx.amountKobo >= 0
                              ? "text-success"
                              : "text-foreground",
                        )}
                      >
                        {settled ? (tx.amountKobo >= 0 ? "+" : "-") : ""}
                        {formatNaira(Math.abs(tx.amountKobo))}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {tx.currency}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {tx.provider ?? "Internal"}
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-3 font-mono text-[11px] text-muted-foreground">
                        {tx.providerReference ?? "None"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={WALLET_STATUS_VARIANT[tx.status]}>
                            {tx.status}
                          </Badge>
                          {unverified ? (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-danger"
                              aria-label="No KoraPay transaction behind this credit"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                        {tx.createdAt.toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {count > PAGE_SIZE ? (
        <p className="text-xs text-muted-foreground">
          Showing the {PAGE_SIZE} most recent of{" "}
          {count.toLocaleString("en-NG")} matching transactions. Narrow the
          search to see older ones.
        </p>
      ) : null}
    </div>
  );
}
