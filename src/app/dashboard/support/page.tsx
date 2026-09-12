import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { faqs } from "@/data/faq";
import { ReportIssue } from "./report-issue";

export const metadata: Metadata = { title: "Support" };

const SUPPORT_EMAIL = "support@xencodes.com";

export default async function SupportPage() {
  const session = await auth();
  const userId = session!.user.id;

  // Only activations worth reporting: ones that failed or are stuck.
  const reportable = await prisma.activation.findMany({
    where: { userId, status: { in: ["WAITING", "EXPIRED"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Most answers are below. If something went wrong with a number, report
          it and we will look into it.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold">Common questions</h2>
        <div className="mt-3">
          <FaqAccordion items={faqs.slice(0, 6)} />
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:border-mint hover:bg-mint-soft"
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
