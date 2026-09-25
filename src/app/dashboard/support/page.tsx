import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail, MessageCircle } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { faqs } from "@/data/faq";
import { ReportIssue } from "./report-issue";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = { title: "Support" };

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@xencodes.com";

const TICKET_STATUS_VARIANT = {
  OPEN: "danger",
  PENDING: "warning",
  RESOLVED: "success",
} as const;

const TICKET_STATUS_LABEL = {
  OPEN: "Open",
  PENDING: "Waiting on us",
  RESOLVED: "Resolved",
} as const;

export default async function SupportPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [reportable, tickets] = await Promise.all([
    // Only activations worth reporting: ones that failed or are stuck.
    prisma.activation.findMany({
      where: { userId, status: { in: ["WAITING", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Most answers are below. If something went wrong, open a ticket and
          we will reply right here in your dashboard.
        </p>
      </div>

      {tickets.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Your tickets</h2>
          <Card className="mt-3 overflow-hidden">
            <ul className="divide-y divide-border">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/dashboard/support/${ticket.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-background"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ticket.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Updated{" "}
                        {ticket.updatedAt.toLocaleDateString("en-NG", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <Badge variant={TICKET_STATUS_VARIANT[ticket.status]}>
                      {TICKET_STATUS_LABEL[ticket.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">Common questions</h2>
        <div className="mt-3">
          <FaqAccordion items={faqs.slice(0, 6)} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Start a new ticket</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Anything not about a specific number, a wallet question or
          anything else.
        </p>
        <div className="mt-3">
          <NewTicketForm />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Report an activation issue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Expired and waiting activations are listed here. Failed activations
          are already refunded automatically, so report one only if something
          looks wrong.
        </p>
        <div className="mt-3">
          <ReportIssue
            activations={reportable.map((activation) => ({
              id: activation.id,
              serviceName: activation.serviceName,
              countryName: activation.countryName,
              phoneNumber: activation.phoneNumber,
              status: activation.status,
              createdAt: activation.createdAt.toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
              }),
            }))}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Contact support</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-soft text-forest">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium">{SUPPORT_EMAIL}</p>
              <p className="text-xs text-muted-foreground">
                Replies usually within a few hours.
              </p>
            </div>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium transition-colors hover:border-mint hover:bg-mint-soft"
          >
            Send an email
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Looking for terms or the refund policy? See{" "}
          <Link href="/terms" className="text-forest underline-offset-4 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/refund-policy"
            className="text-forest underline-offset-4 hover:underline"
          >
            Refunds
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
