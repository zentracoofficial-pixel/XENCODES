import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "./activation-logo";

export const metadata: Metadata = { title: "Overview" };

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

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, activeActivation, recent, deliveredCount] = await Promise.all([
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
    prisma.activation.count({ where: { userId, status: "RECEIVED" } }),
  ]);

  const latestCode = recent.find((a) => a.code);
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Welcome back, ${firstName}` : "Overview"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your balance, your active number, and everything you&apos;ve verified.
        </p>
      </div>

      {/* Balance + counters */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden border-transparent bg-foreground p-6 text-background lg:col-span-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl"
          />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-wide text-background/60">
              Wallet balance
            </p>
            <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">
              {formatNaira(user.walletBalanceKobo)}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/dashboard/wallet" size="sm">
                <Plus className="h-3.5 w-3.5" />
                Add funds
              </Button>
              <Link
                href="/dashboard/wallet"
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-background/70 transition-colors hover:text-background"
              >
                Transactions
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Codes received
            </p>
            <p className="mt-1.5 text-3xl font-semibold tabular-nums">
              {deliveredCount}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Latest code
            </p>
            <p className="mt-1.5 font-mono text-3xl font-semibold tracking-wider text-primary">
              {latestCode?.code ?? "——————"}
            </p>
          </Card>
        </div>
      </div>

      {/* Active number */}
      {activeActivation ? (
        <Card className="flex flex-col gap-4 border-primary/30 bg-primary-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary-muted">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </span>
            </span>
            <div>
              <p className="font-mono font-medium">{activeActivation.phoneNumber}</p>
              <p className="text-sm text-muted-foreground">
                Waiting for {activeActivation.serviceName} · {activeActivation.countryName}
              </p>
            </div>
          </div>
          <Button href={`/buy?activation=${activeActivation.id}`}>
            Open activation
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      ) : null}

      {/* Recent activity */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Recent activity</h2>
          {recent.length > 0 ? (
            <Link
              href="/dashboard/history"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-muted text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="mt-4 font-semibold">No numbers yet</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Add funds to your wallet, pick a service, and your first
              verification code will show up here.
            </p>
            <Button href="/buy" className="mt-5">
              Buy your first number
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((activation) => (
              <li
                key={activation.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ActivationLogo
                    serviceSlug={activation.serviceSlug}
                    serviceName={activation.serviceName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {activation.serviceName}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {activation.phoneNumber}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  {activation.code ? (
                    <span className="hidden font-mono text-sm font-semibold text-primary sm:inline">
                      {activation.code}
                    </span>
                  ) : null}
                  <span className="hidden text-sm tabular-nums text-muted-foreground sm:inline">
                    {formatNaira(activation.priceKobo)}
                  </span>
                  <Badge variant={statusVariant[activation.status]}>
                    {activation.status === "RECEIVED" ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                    {statusLabel[activation.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
