import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Mail, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import { StatTile } from "../stat-tile";

export const metadata: Metadata = { title: "Admin: Support" };

const reasonMeta = {
  EXPIRED: { label: "No code received", variant: "danger" },
  CANCELLED: { label: "Customer cancelled", variant: "neutral" },
} as const;

export default async function AdminSupportPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [failedToday, failedThisWeek, worstService, failures] = await Promise.all([
    prisma.activation.count({
      where: { status: { in: ["EXPIRED", "CANCELLED"] }, createdAt: { gte: startOfToday } },
    }),
    prisma.activation.count({
      where: { status: { in: ["EXPIRED", "CANCELLED"] }, createdAt: { gte: startOfWeek } },
    }),
    prisma.activation.groupBy({
      by: ["serviceName"],
      where: { status: "EXPIRED", createdAt: { gte: startOfWeek } },
      _count: { serviceName: true },
      orderBy: { _count: { serviceName: "desc" } },
      take: 1,
    }),
    prisma.activation.findMany({
      where: { status: { in: ["EXPIRED", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { email: true } } },
    }),
  ]);

  const worst = worstService[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Failed orders worth following up. Each one was already refunded automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Failed today" value={failedToday} icon={AlertTriangle} tone={failedToday > 0 ? "danger" : "default"} />
        <StatTile label="Failed this week" value={failedThisWeek} icon={CalendarClock} />
        <StatTile
          label="Worth investigating"
          value={worst ? worst.serviceName : "None"}
          hint={worst ? `${worst._count.serviceName} no-code failures this week` : "No repeat failures this week"}
          icon={TrendingDown}
          tone={worst ? "danger" : "default"}
        />
      </div>

      <Card className="overflow-hidden">
        {failures.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No failed orders. Nothing to follow up on.</p>
        ) : (
          <ul className="divide-y divide-border">
            {failures.map((order) => {
              const reason = reasonMeta[order.status as "EXPIRED" | "CANCELLED"];
              return (
                <li key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                  <ActivationLogo serviceSlug={order.serviceSlug} serviceName={order.serviceName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{order.serviceName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Link href={`/admin/users/${order.userId}`} className="hover:text-forest hover:underline">
                        {order.user.email}
                      </Link>
                      {" "}· {order.countryName}
                    </p>
                  </div>
                  <Badge variant={reason.variant}>{reason.label}</Badge>
                  <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
                    {formatNaira(order.priceKobo)} refunded
                  </span>
                  <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block">
                    {order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                  </time>
                  <a
                    href={`mailto:${order.user.email}?subject=${encodeURIComponent(`Your Xencodes order for ${order.serviceName}`)}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-mint-soft hover:text-foreground"
                    title={`Email ${order.user.email}`}
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
