import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { realisedMargin } from "@/lib/pricing";
import { ActivationLogo } from "@/app/dashboard/activation-logo";
import {
  ACTIVATION_STATUS_VARIANT,
  ORDER_STATUS_LABEL,
} from "@/lib/activation-status";

export const metadata: Metadata = { title: "Admin: Order" };

export const dynamic = "force-dynamic";

const PRICING_RULE_LABEL: Record<string, string> = {
  default: "Standard margin",
  exclusive: "Exclusive tier",
  service: "Service override",
  legacy: "Priced before the current rules",
};

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * One order, in enough detail to answer what happened and whether it made
 * money, without opening a second page.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const order = await prisma.activation.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!order) notFound();

  // Both sides of the money, tied to this order by activationId.
  const movements = await prisma.walletTransaction.findMany({
    where: { activationId: order.id },
    orderBy: { createdAt: "asc" },
  });

  const priced = order.providerCostKobo > 0;
  const margin = realisedMargin(order.priceKobo, order.providerCostKobo);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/orders"
        className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-muted-foreground hover:text-forest"
      >
        <ArrowLeft className="h-4 w-4" />
        All orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <ActivationLogo
            serviceSlug={order.serviceSlug}
            serviceName={order.serviceName}
            size="lg"
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {order.serviceName}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {order.id}
            </p>
          </div>
        </div>
        <Badge variant={ACTIVATION_STATUS_VARIANT[order.status]}>
          {ORDER_STATUS_LABEL[order.status]}
        </Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Economics</h2>
            </div>
            {priced ? (
              <dl className="grid grid-cols-2 sm:grid-cols-4">
                <Figure label="Customer price" value={formatNaira(order.priceKobo)} />
                <Figure
                  label="Provider cost"
                  value={formatNaira(order.providerCostKobo)}
                />
                <Figure
                  label="Gross profit"
                  value={formatNaira(order.grossProfitKobo)}
                  tone={order.grossProfitKobo > 0 ? "success" : "danger"}
                />
                <Figure label="Gross margin" value={`${margin}%`} />
              </dl>
            ) : (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                This order was placed before provider cost was recorded, so
                its margin cannot be reconstructed. It is excluded from every
                profit figure in the admin rather than counted as pure profit.
              </p>
            )}
            {priced ? (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                Priced by{" "}
                <span className="font-medium text-foreground">
                  {PRICING_RULE_LABEL[order.pricingRule] ?? order.pricingRule}
                </span>
                {order.targetMarginPercent > 0
                  ? `, targeting ${order.targetMarginPercent}%. Realised ${margin}% after rounding up to the nearest Naira.`
                  : "."}
              </p>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Order</h2>
            </div>
            <dl className="divide-y divide-border">
              <Row label="Customer">
                <Link
                  href={`/admin/users/${order.user.id}`}
                  className="text-forest hover:underline"
                >
                  {order.user.email}
                </Link>
              </Row>
              <Row label="Service">
                {order.serviceName}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {order.serviceSlug}
                </span>
              </Row>
              <Row label="Country">{order.countryName}</Row>
              <Row label="Number">
                <span className="font-mono">
                  {formatPhoneNumber(order.phoneNumber)}
                </span>
              </Row>
              <Row label="Verification code">
                {order.code ? (
                  <span className="font-mono">{order.code}</span>
                ) : (
                  <span className="text-muted-foreground">
                    {order.status === "WAITING" ? "Still waiting" : "Never arrived"}
                  </span>
                )}
              </Row>
              <Row label="Provider">{order.provider}</Row>
              <Row label="Provider order id">
                {order.providerOrderId ? (
                  <span className="break-all font-mono text-xs">
                    {order.providerOrderId}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None recorded</span>
                )}
              </Row>
            </dl>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Wallet movements</h2>
            </div>
            {movements.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                No wallet movement is linked to this order. Orders placed
                before movements were linked show nothing here; the
                customer&apos;s full ledger is on their account page.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {movements.map((tx) => (
                  <li key={tx.id}>
                    <Link
                      href={`/admin/wallet/${tx.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-background"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tx.type}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tx.description}
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {tx.createdAt.toLocaleString("en-NG", dateFormat)}
                      </time>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          tx.amountKobo >= 0 ? "text-success" : "text-foreground",
                        )}
                      >
                        {tx.amountKobo >= 0 ? "+" : "-"}
                        {formatNaira(Math.abs(tx.amountKobo))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Timeline</h2>
          </div>
          <dl className="divide-y divide-border">
            <Row label="Placed">
              {order.createdAt.toLocaleString("en-NG", dateFormat)}
            </Row>
            <Row label="Session ends">
              {order.expiresAt.toLocaleString("en-NG", dateFormat)}
            </Row>
            <Row label="Code received">
              {order.receivedAt
                ? order.receivedAt.toLocaleString("en-NG", dateFormat)
                : "Never"}
            </Row>
            <Row label="Last updated">
              {order.updatedAt.toLocaleString("en-NG", dateFormat)}
            </Row>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="border-b border-r border-border px-5 py-4 last:border-r-0 sm:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "success"
            ? "text-success"
            : tone === "danger"
              ? "text-danger"
              : "",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
