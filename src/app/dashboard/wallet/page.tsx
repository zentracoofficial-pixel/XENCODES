import type { Metadata } from "next";
import { ArrowDownLeft, ArrowUpRight, RotateCcw, Wallet as WalletIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { AddFunds } from "./add-funds";

export const metadata: Metadata = { title: "Wallet" };

const typeMeta = {
  TOPUP: { label: "Top-up", icon: ArrowDownLeft, tone: "text-success" },
  PURCHASE: { label: "Number purchase", icon: ArrowUpRight, tone: "text-foreground" },
  REFUND: { label: "Refund", icon: RotateCcw, tone: "text-success" },
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

  const [user, transactions, toppedUp, refunded] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, type: "TOPUP" },
      _sum: { amountKobo: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, type: "REFUND" },
      _sum: { amountKobo: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fund your balance, then spend it on numbers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden border-transparent bg-foreground p-6 text-background">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-wide text-background/60">
              Available balance
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
              {formatNaira(user.walletBalanceKobo)}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-background/15 pt-4 text-xs">
              <div>
                <dt className="text-background/60">Topped up</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {formatNaira(toppedUp._sum.amountKobo ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-background/60">Refunded</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {formatNaira(refunded._sum.amountKobo ?? 0)}
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <AddFunds />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Transactions</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <WalletIcon className="h-5 w-5" />
            </span>
            <p className="mt-4 font-semibold">No transactions yet</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Top-ups, purchases and refunds will all be listed here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((tx) => {
              const meta = typeMeta[tx.type];
              const credit = tx.amountKobo >= 0;
              return (
                <li key={tx.id} className="flex items-center gap-4 px-5 py-3.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      credit ? "bg-success-muted text-success" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    <meta.icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.description}
                    </p>
                  </div>

                  <time
                    dateTime={tx.createdAt.toISOString()}
                    className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                  >
                    {tx.createdAt.toLocaleString("en-NG", dateFormat)}
                  </time>

                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      credit ? "text-success" : "text-foreground"
                    }`}
                  >
                    {credit ? "+" : "−"}
                    {formatNaira(Math.abs(tx.amountKobo))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
