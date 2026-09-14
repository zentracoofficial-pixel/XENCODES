import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import type { ActivationStatus } from "@/generated/prisma/client";
import { ACTIVATION_STATUS_VARIANT } from "@/lib/activation-status";

export const metadata: Metadata = { title: "Admin: Orders" };

export const dynamic = "force-dynamic";

const filters: { label: string; value: ActivationStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Waiting", value: "WAITING" },
  { label: "Delivered", value: "RECEIVED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Refunded", value: "REFUNDED" },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();

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
              "inline-flex min-h-10 items-center rounded-full border px-4 text-xs font-medium transition-colors",
              activeFilter === f.value
                ? "border-forest bg-primary text-white"
                : "border-border text-muted-foreground hover:bg-mint-soft",
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
                    <Link href={`/admin/users/${order.userId}`} className="hover:text-forest hover:underline">
                      {order.user.email}
                    </Link>{" "}
                    · {order.countryName}
                  </p>
                </div>
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {formatPhoneNumber(order.phoneNumber)}
                </span>
                {/* The three figures that answer whether this order made
                    money: what the customer paid, what the provider
                    charged, and the difference. */}
                <span className="hidden w-28 shrink-0 text-right lg:block">
                  <span className="block text-sm font-medium tabular-nums">
                    {formatNaira(order.priceKobo)}
                  </span>
                  <span className="block text-xs tabular-nums text-muted-foreground">
                    cost {formatNaira(order.providerCostKobo)}
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block",
                    order.markupKobo > 0 ? "text-success" : "text-muted-foreground",
                  )}
                  title="Margin on this order"
                >
                  {order.providerCostKobo > 0 ? formatNaira(order.markupKobo) : "n/a"}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground lg:hidden">
                  {formatNaira(order.priceKobo)}
                </span>
                <time className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground lg:block">
                  {order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                </time>
                <Badge variant={ACTIVATION_STATUS_VARIANT[order.status]}>{order.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
