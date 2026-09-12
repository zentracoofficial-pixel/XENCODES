import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AddFunds } from "./add-funds";

export const metadata: Metadata = {
  title: "Wallet",
};

const typeLabel = {
  TOPUP: "Top-up",
  PURCHASE: "Purchase",
  REFUND: "Refund",
} as const;

export default async function WalletPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <StatCard label="Current balance" value={`$${(user.walletBalanceCents / 100).toFixed(2)}`} />
          <AddFunds />
        </div>

        <Card className="overflow-x-auto">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">Transaction history</h2>
          </div>
          {transactions.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No transactions yet.
            </p>
          ) : (
            <table className="w-full min-w-[480px] text-sm">
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-medium">{typeLabel[tx.type]}</p>
                      <p className="text-xs text-muted-foreground">{tx.description}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-muted-foreground">
                      {tx.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-semibold ${
                        tx.amountCents >= 0 ? "text-success" : "text-foreground"
                      }`}
                    >
                      {tx.amountCents >= 0 ? "+" : "-"}${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
