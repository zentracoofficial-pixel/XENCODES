import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";
import { WALLET_STATUS_VARIANT } from "@/lib/wallet-status";

export const metadata: Metadata = { title: "Admin: Transaction" };

export const dynamic = "force-dynamic";

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** One transaction in full, including the fields that only matter when
 *  something has gone wrong and a payment needs reconciling. */
export default async function AdminTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const tx = await prisma.walletTransaction.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, walletBalanceKobo: true } } },
  });
  if (!tx) notFound();

  const order = tx.activationId
    ? await prisma.activation.findUnique({
        where: { id: tx.activationId },
        select: { id: true, serviceName: true, countryName: true },
      })
    : null;

  const settled = tx.status === "SUCCESSFUL";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/admin/wallet"
        className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-muted-foreground hover:text-forest"
      >
        <ArrowLeft className="h-4 w-4" />
        All transactions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className={cn(
              "text-3xl font-semibold tabular-nums",
              !settled
                ? "text-muted-foreground"
                : tx.amountKobo >= 0
                  ? "text-success"
                  : "",
            )}
          >
            {settled ? (tx.amountKobo >= 0 ? "+" : "-") : ""}
            {tx.currency} {formatNaira(Math.abs(tx.amountKobo)).replace(/^₦/, "")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{tx.description}</p>
        </div>
        <Badge variant={WALLET_STATUS_VARIANT[tx.status]}>{tx.status}</Badge>
      </div>

      {tx.status === "PENDING" ? (
        <p className="rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning">
          This is a funding request, not a payment. No money has been received
          and the customer&apos;s balance has not changed. It settles only when
          a payment is verified with the payment provider.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <dl className="divide-y divide-border">
          <Row label="Transaction id">
            <span className="break-all font-mono text-xs">{tx.id}</span>
          </Row>
          <Row label="User">
            <Link
              href={`/admin/users/${tx.user.id}`}
              className="text-forest hover:underline"
            >
              {tx.user.email}
            </Link>
          </Row>
          <Row label="Balance now">{formatNaira(tx.user.walletBalanceKobo)}</Row>
          <Row label="Type">{tx.type}</Row>
          <Row label="Amount">
            {tx.currency} {formatNaira(Math.abs(tx.amountKobo)).replace(/^₦/, "")}
          </Row>
          <Row label="Payment provider">{tx.provider ?? "Internal movement"}</Row>
          <Row label="Our reference">
            {tx.providerReference ? (
              <span className="break-all font-mono text-xs">
                {tx.providerReference}
              </span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
          <Row label="Provider reference">
            {tx.providerTransactionId ? (
              <span className="break-all font-mono text-xs">
                {tx.providerTransactionId}
              </span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Row>
          <Row label="Created">
            {tx.createdAt.toLocaleString("en-NG", dateFormat)}
          </Row>
          <Row label="Completed">
            {tx.completedAt
              ? tx.completedAt.toLocaleString("en-NG", dateFormat)
              : "Not yet"}
          </Row>
          {tx.failureReason ? (
            <Row label="Failure reason">
              <span className="text-danger">{tx.failureReason}</span>
            </Row>
          ) : null}
          {order ? (
            <Row label="Order">
              <Link
                href={`/admin/orders/${order.id}`}
                className="text-forest hover:underline"
              >
                {order.serviceName}, {order.countryName}
              </Link>
            </Row>
          ) : null}
        </dl>
      </Card>
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
