import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira, formatPhoneNumber } from "@/lib/currency";
import { ActivationLogo } from "../activation-logo";

export const metadata: Metadata = { title: "History" };

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

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

export default async function HistoryPage() {
  const session = await auth();
  const userId = session!.user.id;

  const activations = await prisma.activation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
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
          <Button href="/buy" className="mt-5">
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
                    {activation.code ?? (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNaira(activation.priceKobo)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {activation.createdAt.toLocaleString("en-NG", dateFormat)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[activation.status]}>
                      {statusLabel[activation.status]}
                    </Badge>
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
                  <Badge variant={statusVariant[activation.status]}>
                    {statusLabel[activation.status]}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 pl-11">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {formatPhoneNumber(activation.phoneNumber)}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {activation.code ? (
                      <span className="font-mono text-sm tabular-nums">
                        {activation.code}
                      </span>
                    ) : null}
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatNaira(activation.priceKobo)}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
