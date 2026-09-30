import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { WALLET_STATUS_VARIANT } from "@/lib/wallet-status";
import { isUnverifiedTopup, reconcileTopUp } from "@/lib/funding";
import type { PaymentVerificationResult, PaymentVerificationTrigger } from "@/generated/prisma/client";
import { VoidTopupButton } from "../void-topup-button";
import { RecheckTopupButton } from "../recheck-topup-button";

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

  const initial = await prisma.walletTransaction.findUnique({ where: { id } });
  if (!initial) notFound();

  // Opportunistic check, same as the customer's own wallet page: an admin
  // opening a stuck PENDING top up is itself a reasonable moment to ask
  // KoraPay again, backed off per transaction (USER_VIEW trigger) so
  // repeatedly opening this page does not itself hammer KoraPay. The
  // explicit "Recheck" button below always forces a check regardless.
  if (initial.type === "TOPUP" && initial.status === "PENDING" && initial.providerReference) {
    await reconcileTopUp(initial.providerReference, "USER_VIEW").catch((error) =>
      console.error(`[admin-wallet] opportunistic reconcile failed for ${initial.providerReference}:`, error),
    );
  }

  const tx = await prisma.walletTransaction.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, walletBalanceKobo: true, currency: true } },
      verificationLogs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!tx) notFound();

  const order = tx.activationId
    ? await prisma.activation.findUnique({
        where: { id: tx.activationId },
        select: { id: true, serviceName: true, countryName: true },
      })
    : null;

  const settled = tx.status === "SUCCESSFUL";
  const unverified = isUnverifiedTopup(tx);

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
            {formatMoney(Math.abs(tx.amountKobo), tx.currency)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{tx.description}</p>
        </div>
        <Badge variant={WALLET_STATUS_VARIANT[tx.status]}>{tx.status}</Badge>
      </div>

      {tx.status === "PENDING" ? (
        <div className="space-y-3 rounded-lg bg-warning-soft px-3.5 py-3">
          <p className="text-sm text-warning">
            This is a funding request, not a payment. No money has been received
            and the customer&apos;s balance has not changed. It settles only when
            a payment is verified with the payment provider.
          </p>
          {tx.type === "TOPUP" && tx.providerReference ? (
            <RecheckTopupButton transactionId={tx.id} />
          ) : null}
        </div>
      ) : null}

      {unverified ? (
        <div className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 px-3.5 py-3">
          <p className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This top up was marked successful with no KoraPay transaction
              behind it (no provider reference below). The current payment
              architecture cannot produce that; this record predates it. It
              is very likely the source of a wallet balance that was never
              actually paid for.
            </span>
          </p>
          <VoidTopupButton transactionId={tx.id} />
        </div>
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
          <Row label="Balance now">{formatMoney(tx.user.walletBalanceKobo, tx.user.currency)}</Row>
          <Row label="Type">{tx.type}</Row>
          <Row label="Amount">
            {formatMoney(Math.abs(tx.amountKobo), tx.currency)}
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
          {tx.providerReference ? (
            <>
              <Row label="Verification attempts">{tx.verificationAttempts}</Row>
              <Row label="Last verification attempt">
                {tx.lastVerificationAttemptAt
                  ? tx.lastVerificationAttemptAt.toLocaleString("en-NG", dateFormat)
                  : "Never checked"}
              </Row>
            </>
          ) : null}
        </dl>
      </Card>

      {tx.verificationLogs.length > 0 ? (
        <Card className="overflow-hidden">
          <p className="border-b border-border bg-background px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Verification history
          </p>
          <ul className="divide-y divide-border">
            {tx.verificationLogs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <div>
                  <span className="font-medium">{RESULT_LABEL[log.result]}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {TRIGGER_LABEL[log.trigger]}
                    {log.adminEmail ? ` by ${log.adminEmail}` : ""}
                  </span>
                  {log.failureReason ? (
                    <span className="ml-2 text-xs text-danger">{log.failureReason}</span>
                  ) : null}
                </div>
                <time
                  dateTime={log.createdAt.toISOString()}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {log.createdAt.toLocaleString("en-NG", dateFormat)}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

const RESULT_LABEL: Record<PaymentVerificationResult, string> = {
  CREDITED: "Credited",
  ALREADY_CREDITED: "Already credited",
  STILL_PENDING: "Still pending at KoraPay",
  FAILED: "Failed",
  MISMATCH: "Amount/currency mismatch — not credited",
  PROVIDER_UNAVAILABLE: "KoraPay could not be reached",
  UNKNOWN_REFERENCE: "Unknown reference",
};

const TRIGGER_LABEL: Record<PaymentVerificationTrigger, string> = {
  WEBHOOK: "KoraPay webhook",
  RETURN_REDIRECT: "Customer returned from checkout",
  USER_VIEW: "Page view",
  ADMIN_MANUAL: "Manual admin recheck",
  RECONCILIATION_SWEEP: "Automatic sweep",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
