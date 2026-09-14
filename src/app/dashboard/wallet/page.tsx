import type { Metadata } from "next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Sparkles,
  Wallet as WalletIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { AddFunds } from "./add-funds";

export const metadata: Metadata = { title: "Wallet" };

const typeMeta = {
  TOPUP: { label: "Top-up", icon: ArrowDownLeft },
  PURCHASE: { label: "Number purchase", icon: ArrowUpRight },
  REFUND: { label: "Refund", icon: RotateCcw },
  ADJUSTMENT: { label: "Account adjustment", icon: Sparkles },
} as const;

const STATUS_WORDING = {
  PENDING: "awaiting payment",
  SUCCESSFUL: "completed",
  FAILED: "payment failed",
  CANCELLED: "cancelled",
} as const;

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

export default async function WalletPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add funds, then spend them on numbers. Refunds come straight back here.
        </p>
      </div>

      <div className="rounded-2xl bg-forest px-6 py-5">
        <p className="text-xs uppercase tracking-[0.14em] text-white/50">
          Current balance
        </p>
        <p className="mt-1.5 text-4xl font-semibold tabular-nums text-white">
          {formatNaira(user.walletBalanceKobo)}
        </p>
      </div>

      <AddFunds />

      <section>
        <h2 className="text-sm font-semibold">Recent transactions</h2>

        {transactions.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-mint-soft text-forest">
              <WalletIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 font-medium">No transactions yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Top-ups, purchases and refunds all show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {transactions.map((tx) => {
              const meta = typeMeta[tx.type];
              // Only a settled credit is styled as money gained. A pending
              // top up is shown in the muted style, because reading it as
              // a green "+" would suggest a balance that has not moved.
              const settled = tx.status === "SUCCESSFUL";
              const credit = tx.amountKobo >= 0 && settled;
              return (
                <li key={tx.id} className="flex items-center gap-3.5 px-4 py-3">
                  <span
                    className={
                      credit
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground"
                    }
                  >
                    <meta.icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.status === "SUCCESSFUL"
                        ? tx.description
                        : `${tx.description}, ${STATUS_WORDING[tx.status]}`}
                    </p>
                  </div>

                  <time
                    dateTime={tx.createdAt.toISOString()}
                    className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                  >
                    {tx.createdAt.toLocaleString("en-NG", dateFormat)}
                  </time>

                  <span
                    className={
                      credit
                        ? "shrink-0 text-sm font-semibold tabular-nums text-success"
                        : settled
                          ? "shrink-0 text-sm font-semibold tabular-nums"
                          : "shrink-0 text-sm font-semibold tabular-nums text-muted-foreground"
                    }
                  >
                    {settled ? (tx.amountKobo >= 0 ? "+" : "-") : ""}
                    {formatNaira(Math.abs(tx.amountKobo))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
