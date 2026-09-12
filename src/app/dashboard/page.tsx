import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "./activation-logo";

export const metadata: Metadata = { title: "Dashboard" };

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "neutral",
} as const;

const statusLabel = {
  WAITING: "Waiting",
  RECEIVED: "Delivered",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
} as const;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, current, recent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.activation.findFirst({
      where: { userId, status: "WAITING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const firstName = user.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your balance, your current number and what you have verified.
          </p>
        </div>
        <Button href="/buy">
          <Plus className="h-4 w-4" />
          Buy Number
        </Button>
      </div>

      {/* Balance. */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-forest px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-white/50">
            Wallet balance
          </p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-white">
            {formatNaira(user.walletBalanceKobo)}
          </p>
        </div>
        <Button href="/dashboard/wallet" variant="onDark" size="sm">
          Add funds
        </Button>
      </div>

      {/* Current activation. */}
      <section>
        <h2 className="text-sm font-semibold">Current activation</h2>
        {current ? (
          <Link
            href={`/buy?activation=${current.id}`}
            className="mt-3 flex items-center gap-3.5 rounded-xl border border-mint bg-mint-soft px-4 py-3.5 transition-colors hover:bg-mint-soft/70"
          >
            <ActivationLogo
              serviceSlug={current.serviceSlug}
              serviceName={current.serviceName}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.serviceName}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {formatPhoneNumber(current.phoneNumber)}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className="h-1.5 w-1.5 animate-live rounded-full bg-mint" />
              <span className="text-xs font-medium text-forest">
                Waiting for SMS
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-forest" />
          </Link>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-5">
            <p className="text-sm text-muted-foreground">
              No number is active. Buy one to receive a code.
            </p>
            <Button href="/buy" size="sm" variant="outline">
              Get a Number
            </Button>
          </div>
        )}
      </section>

      {/* Recent activations. */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activations</h2>
          {recent.length > 0 ? (
            <Link
              href="/dashboard/history"
              className="text-xs font-medium text-forest underline-offset-4 hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Your activations will show up as you buy numbers.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {recent.map((activation) => (
              <li
                key={activation.id}
                className="flex items-center gap-3.5 px-4 py-3"
              >
                <ActivationLogo
                  serviceSlug={activation.serviceSlug}
                  serviceName={activation.serviceName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {activation.serviceName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {activation.countryName}
                  </p>
                </div>
                {activation.code ? (
                  <span className="hidden font-mono text-sm tabular-nums sm:inline">
                    {activation.code}
                  </span>
                ) : null}
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatNaira(activation.priceKobo)}
                </span>
                <Badge variant={statusVariant[activation.status]}>
                  {statusLabel[activation.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
