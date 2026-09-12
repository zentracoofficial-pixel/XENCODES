import type { Metadata } from "next";
import { ArrowRight, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "../activation-logo";

export const metadata: Metadata = { title: "History" };

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "outline",
} as const;

const statusLabel = {
  WAITING: "Waiting",
  RECEIVED: "Delivered",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
} as const;

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

export default async function HistoryPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [activations, spentAgg, delivered] = await Promise.all([
    prisma.activation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.walletTransaction.aggregate({
      where: { userId, type: "PURCHASE" },
      _sum: { amountKobo: true },
    }),
    prisma.activation.count({ where: { userId, status: "RECEIVED" } }),
  ]);

  const totalSpentKobo = Math.abs(spentAgg._sum.amountKobo ?? 0);
  const successRate = activations.length
    ? Math.round((delivered / activations.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every number you&apos;ve bought and how it turned out.
        </p>
      </div>

      {activations.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Numbers bought
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {activations.length}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Codes received
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {delivered}{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({successRate}%)
              </span>
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total spent
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">
              {formatNaira(totalSpentKobo)}
            </p>
          </Card>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {activations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <Clock3 className="h-5 w-5" />
            </span>
            <p className="mt-4 font-semibold">Nothing here yet</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Once you buy a number, it&apos;ll appear here with its status,
              price and the code it received.
            </p>
            <Button href="/buy" className="mt-5">
              Buy a number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {activations.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-5 py-4">
                <ActivationLogo
                  serviceSlug={a.serviceSlug}
                  serviceName={a.serviceName}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.serviceName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{a.phoneNumber}</span> ·{" "}
                    {a.countryName}
                  </p>
                </div>

                {a.code ? (
                  <span className="hidden font-mono text-sm font-semibold text-primary md:inline">
                    {a.code}
                  </span>
                ) : null}

                <span className="hidden text-sm tabular-nums text-muted-foreground sm:inline">
                  {formatNaira(a.priceKobo)}
                </span>

                <time
                  dateTime={a.createdAt.toISOString()}
                  className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground lg:block"
                >
                  {a.createdAt.toLocaleString("en-NG", dateFormat)}
                </time>

                <Badge variant={statusVariant[a.status]}>{statusLabel[a.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
