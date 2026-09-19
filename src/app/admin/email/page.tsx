import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { EmailComposer } from "./composer";

export const metadata: Metadata = { title: "Admin: Email" };

export const dynamic = "force-dynamic";

const CAMPAIGN_STATUS_VARIANT = {
  DRAFT: "neutral",
  SENDING: "warning",
  SENT: "success",
  FAILED: "danger",
} as const;

/**
 * Compose and history live on one page as two tabs, not two nav items: a
 * campaign's history is only ever interesting in the context of sending
 * another one, so it does not earn a place of its own in the sidebar.
 */
export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();
  const { tab } = await searchParams;
  const activeTab = tab === "history" ? "history" : "compose";

  const campaigns =
    activeTab === "history"
      ? await prisma.emailCampaign.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a branded email to a targeted group of customers.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["compose", "history"] as const).map((key) => (
          <Link
            key={key}
            href={key === "compose" ? "/admin/email" : "/admin/email?tab=history"}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium capitalize transition-colors",
              activeTab === key
                ? "border-forest text-forest"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {key}
          </Link>
        ))}
      </div>

      {activeTab === "compose" ? (
        <EmailComposer />
      ) : (
        <Card className="overflow-hidden">
          {campaigns.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No campaigns sent yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-background text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Subject</th>
                    <th className="px-3 py-2.5 font-medium">Audience</th>
                    <th className="px-3 py-2.5 text-right font-medium">Recipients</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                    <th className="px-3 py-2.5 text-right font-medium">Failed</th>
                    <th className="px-3 py-2.5 font-medium">Sent by</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3 font-medium">
                        {c.subject}
                        {c.failureReason ? (
                          <span className="mt-0.5 block text-xs font-normal text-danger">
                            {c.failureReason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{c.audienceLabel}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.recipientCount}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-success">
                        {c.sentCount}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-danger">
                        {c.failedCount || 0}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{c.adminEmail}</td>
                      <td className="px-3 py-3">
                        <Badge variant={CAMPAIGN_STATUS_VARIANT[c.status]}>{c.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-muted-foreground">
                        {c.createdAt.toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
