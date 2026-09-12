import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquareText, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Dashboard",
};

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "outline",
} as const;

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, activeActivation, recentActivations] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.activation.findFirst({
      where: { userId, status: { in: ["WAITING", "RECEIVED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const recentSms = recentActivations.filter((a) => a.code);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Button href="/buy" size="lg">
          <Plus className="h-4 w-4" />
          Buy Number
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Balance"
          value={`$${(user.walletBalanceCents / 100).toFixed(2)}`}
          hint="Add funds from the Wallet page"
        />
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Active Number</p>
          {activeActivation ? (
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{activeActivation.phoneNumber}</p>
                <p className="text-xs text-muted-foreground">{activeActivation.serviceName}</p>
              </div>
              <Link href={`/buy?activation=${activeActivation.id}`}>
                <Badge variant={statusVariant[activeActivation.status]}>
                  {activeActivation.status === "WAITING" ? "Waiting" : "Delivered"}
                </Badge>
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No active number right now.</p>
          )}
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent Activations</h2>
            <Link href="/dashboard/history" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentActivations.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              You haven&apos;t purchased a number yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentActivations.map((activation) => (
                <li key={activation.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{activation.serviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      {activation.countryName} &middot; {activation.phoneNumber}
                    </p>
                  </div>
                  <Badge variant={statusVariant[activation.status]}>{activation.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">SMS</h2>
          {recentSms.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Verification codes you receive will appear here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentSms.map((activation) => (
                <li key={activation.id} className="flex items-start gap-3 text-sm">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success-muted text-success">
                    <MessageSquareText className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-medium">{activation.serviceName}</p>
                    <p className="font-mono text-muted-foreground">{activation.code}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-8 flex justify-center">
        <Button href="/buy" variant="outline">
          Buy another number
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
