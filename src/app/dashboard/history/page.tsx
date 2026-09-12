import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatNaira } from "@/lib/currency";

export const metadata: Metadata = {
  title: "History",
};

const statusVariant = {
  WAITING: "warning",
  RECEIVED: "success",
  EXPIRED: "danger",
  CANCELLED: "outline",
} as const;

export default async function HistoryPage() {
  const session = await auth();
  const activations = await prisma.activation.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        All of your previous number purchases.
      </p>

      <Card className="mt-6 overflow-x-auto">
        {activations.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No activations yet.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Country</th>
                <th className="px-5 py-3 font-medium">Number</th>
                <th className="px-5 py-3 font-medium">Price</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {activations.map((activation) => (
                <tr key={activation.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3.5 font-medium">{activation.serviceName}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{activation.countryName}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">{activation.phoneNumber}</td>
                  <td className="px-5 py-3.5">{formatNaira(activation.priceKobo)}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusVariant[activation.status]}>{activation.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {activation.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
