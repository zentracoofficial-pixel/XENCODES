import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Admin: User" };

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "neutral",
} as const;

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      activations: { orderBy: { createdAt: "desc" }, take: 10 },
      walletTransactions: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!user) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.email}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Joined{" "}
            {user.createdAt.toLocaleDateString("en-NG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>
              {user.status}
            </Badge>
            {user.role === "ADMIN" ? <Badge variant="default">Admin</Badge> : null}
          </p>
        </div>
        <Card className="px-5 py-3 text-right">
          <p className="text-xs text-muted-foreground">Wallet balance</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatNaira(user.walletBalanceKobo)}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent activations</h2>
            </div>
            {user.activations.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No activations yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {user.activations.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                    <ActivationLogo serviceSlug={a.serviceSlug} serviceName={a.serviceName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.serviceName}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {a.phoneNumber} · {a.countryName}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatNaira(a.priceKobo)}
                    </span>
                    <Badge variant={statusVariant[a.status]}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Recent transactions</h2>
            </div>
            {user.walletTransactions.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {user.walletTransactions.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{tx.type}</p>
                      <p className="truncate text-xs text-muted-foreground">{tx.description}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        tx.amountKobo >= 0 ? "text-success" : "text-foreground"
                      }`}
                    >
                      {tx.amountKobo >= 0 ? "+" : "-"}
                      {formatNaira(Math.abs(tx.amountKobo))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <UserActions
          userId={user.id}
          status={user.status}
          role={user.role}
          isSelf={admin.id === user.id}
        />
      </div>
    </div>
  );
}
