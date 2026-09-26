import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "../activation-logo";
import { ACTIVATION_STATUS_LABEL, ACTIVATION_STATUS_VARIANT } from "@/lib/activation-status";
import { CopyCodeButton } from "./copy-code-button";

/** Reuses the exact service+country the order was for; the buy page always
 *  re-quotes live and re-checks availability the moment it loads (see
 *  BuyPanel's own initialCountrySlug comment), so this can never carry
 *  forward a stale price or an assumption that the pair is still in stock. */
function buyAgainHref(serviceSlug: string, countrySlug: string): string {
  return `/dashboard/buy?service=${encodeURIComponent(serviceSlug)}&country=${encodeURIComponent(countrySlug)}`;
}

export const metadata: Metadata = { title: "History" };

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

export default async function HistoryPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Bounded the same way the wallet page's own history is: a customer who
  // has bought hundreds of numbers should not turn every visit to this page
  // into an unbounded table scan and an ever-growing page of rows.
  const HISTORY_LIMIT = 100;
  const activations = await prisma.activation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every number you have bought, and what happened to it.
        </p>
      </div>

      {activations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
          <p className="font-medium">No activations yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Once you buy your first number it will appear here with its code and
            status.
          </p>
          <Button href="/dashboard/buy" className="mt-5">
            Get a Number
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Table on wide screens, stacked rows on phones. */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {activations.map((activation) => (
                <tr
                  key={activation.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5 font-medium">
                      <ActivationLogo
                        serviceSlug={activation.serviceSlug}
                        serviceName={activation.serviceName}
                        size="sm"
                      />
                      {activation.serviceName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {activation.countryName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatPhoneNumber(activation.phoneNumber)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    {activation.code ? (
                      <span className="flex items-center gap-1.5">
                        {activation.code}
                        <CopyCodeButton code={activation.code} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(activation.priceKobo, activation.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {activation.createdAt.toLocaleString("en-NG", dateFormat)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ACTIVATION_STATUS_VARIANT[activation.status]}>
                      {ACTIVATION_STATUS_LABEL[activation.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={buyAgainHref(activation.serviceSlug, activation.countrySlug)}
                      className="whitespace-nowrap text-xs font-medium text-forest hover:underline"
                    >
                      Buy again
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-border sm:hidden">
            {activations.map((activation) => (
              <li key={activation.id} className="px-4 py-3.5">
                <div className="flex items-center gap-3">
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
                      {activation.countryName} ·{" "}
                      {activation.createdAt.toLocaleString("en-NG", dateFormat)}
                    </p>
                  </div>
                  <Badge variant={ACTIVATION_STATUS_VARIANT[activation.status]}>
                    {ACTIVATION_STATUS_LABEL[activation.status]}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 pl-11">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {formatPhoneNumber(activation.phoneNumber)}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {activation.code ? (
                      <span className="flex items-center gap-1 font-mono text-sm tabular-nums">
                        {activation.code}
                        <CopyCodeButton code={activation.code} />
                      </span>
                    ) : null}
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatMoney(activation.priceKobo, activation.currency)}
                    </span>
                  </span>
                </div>
                <div className="mt-2 pl-11">
                  <Link
                    href={buyAgainHref(activation.serviceSlug, activation.countrySlug)}
                    className="text-xs font-medium text-forest hover:underline"
                  >
                    Buy again
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
