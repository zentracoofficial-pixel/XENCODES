import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import type { ActivationStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Admin — Orders" };

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "outline",
} as const;

const filters: { label: string; value: ActivationStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Waiting", value: "WAITING" },
  { label: "Delivered", value: "RECEIVED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter = filters.find((f) => f.value === status)?.value ?? "ALL";

  const orders = await prisma.activation.findMany({
    where: activeFilter === "ALL" ? undefined : { status: activeFilter },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every number purchased across the platform.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "ALL" ? "/admin/orders" : `/admin/orders?status=${f.value}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              activeFilter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No orders match this filter.</p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 px-5 py-3.5">
                <ActivationLogo
                  serviceSlug={order.serviceSlug}
                  serviceName={order.serviceName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{order.serviceName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link href={`/admin/users/${order.userId}`} className="hover:text-primary hover:underline">
                      {order.user.email}
                    </Link>{" "}
                    · {order.countryName}
                  </p>
                </div>
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {order.phoneNumber}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatNaira(order.priceKobo)}
                </span>
                <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block">
                  {order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                </time>
                <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
