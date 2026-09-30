import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import {
  getRecoveryCandidate,
  getRecoveryEmailLog,
  getRecoverySettings,
} from "@/lib/recovery";
import { RecoveryComposer } from "./composer";
import { resolveRecoveryAction, dismissRecoveryAction } from "../actions";

export const metadata: Metadata = { title: "Admin: Customer recovery" };
export const dynamic = "force-dynamic";

export default async function AdminRecoveryDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;

  const [candidate, emailLog, settings] = await Promise.all([
    getRecoveryCandidate(userId),
    getRecoveryEmailLog(userId),
    getRecoverySettings(),
  ]);
  if (!candidate) notFound();

  const defaultSubject = `Need help getting your ${candidate.recommendedServiceName ?? "verification"} code?`;
  const defaultBody = `Hi {{first_name}},

We noticed you've tried a few numbers for {{service}} without receiving the code.${
    candidate.recommendedCountryName
      ? "\n\nWe'd recommend trying {{recommended_country}} next — it currently has stronger delivery performance for {{service}}."
      : ""
  }

If you're still having trouble, reply to this message and we'll help you find the best available option.

Xencodes Team`;

  return (
    <div className="space-y-5">
      <Link
        href="/admin/recovery"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Customer recovery
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {candidate.name || candidate.email}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{candidate.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              candidate.status === "OPEN"
                ? "warning"
                : candidate.status === "RESOLVED"
                  ? "success"
                  : "neutral"
            }
          >
            {candidate.status}
          </Badge>
          {candidate.status === "OPEN" ? (
            <>
              <form action={resolveRecoveryAction.bind(null, userId)}>
                <Button type="submit" variant="outline" size="sm" className="gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Mark resolved
                </Button>
              </form>
              <form action={dismissRecoveryAction.bind(null, userId)}>
                <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
                  <X className="h-3.5 w-3.5" />
                  Dismiss
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label="Recent purchases" value={String(candidate.purchaseCount)} />
        <Stat label="Successful codes" value={String(candidate.successCount)} />
        <Stat label="No-code / failed" value={String(candidate.noCodeCount)} />
        <Stat label="Wallet balance" value={formatMoney(candidate.walletBalanceKobo, candidate.currency)} />
      </Card>

      <Card className="space-y-3 p-5 text-sm">
        <Row label="Services" value={candidate.affectedServices.join(", ") || "—"} />
        <Row label="Countries" value={candidate.affectedCountries.join(", ") || "—"} />
        <Row
          label="Last purchase"
          value={candidate.lastPurchaseAt.toLocaleString("en-NG", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
        />
        <Row
          label="Last successful code"
          value={
            candidate.lastSuccessAt
              ? candidate.lastSuccessAt.toLocaleString("en-NG", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Never"
          }
        />
        <Row
          label="Suggested next step"
          value={
            candidate.recommendedCountryName
              ? `Recommend ${candidate.recommendedCountryName} for ${candidate.recommendedServiceName} — it currently has stronger delivery performance.`
              : "No current recommendation is available for the affected service (it may be disabled or out of stock right now)."
          }
        />
        <Row
          label="Last recovery email"
          value={
            candidate.lastEmailedAt
              ? candidate.lastEmailedAt.toLocaleString("en-NG", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Never contacted"
          }
        />
      </Card>

      <div>
        <h2 className="text-sm font-semibold">Send a message</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Automatic recovery emails are currently{" "}
          <span className="font-medium">{settings.autoEmailEnabled ? "enabled" : "disabled"}</span> in
          Settings. This sends a one-off manual message regardless of that setting.
        </p>
        <div className="mt-3">
          <RecoveryComposer userId={userId} defaultSubject={defaultSubject} defaultBody={defaultBody} />
        </div>
      </div>

      {emailLog.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold">Recovery email history</h2>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
            {emailLog.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{entry.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.emailType === "AUTOMATIC" ? "Automatic" : `Manual · ${entry.sentByAdminEmail ?? "—"}`}
                    {" · "}
                    {entry.createdAt.toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge variant={entry.status === "SENT" ? "success" : "danger"}>{entry.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
