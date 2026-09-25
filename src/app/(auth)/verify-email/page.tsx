import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { getActiveUser } from "@/lib/session";
import { verifyEmailToken, getResendEligibility } from "@/lib/verification";
import { VerifyPendingScreen } from "./verify-pending";

export const metadata: Metadata = {
  title: "Verify email",
};

/**
 * Dual-purpose by design, rather than a second, confusingly similar route:
 * with a ?token= it consumes that token (the link from the verification
 * email); without one it's the pending-verification screen a customer lands
 * on right after signup and can return to from the dashboard banner.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (token) {
    return <TokenResult token={token} />;
  }

  const user = await getActiveUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/dashboard");

  const [eligibility, pendingRequest] = await Promise.all([
    getResendEligibility(user.id),
    prisma.manualVerificationRequest.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const initialManualStatus =
    pendingRequest?.status === "PENDING"
      ? ("pending" as const)
      : pendingRequest?.status === "REJECTED"
        ? ("rejected" as const)
        : ("none" as const);

  return (
    <VerifyPendingScreen
      email={user.email}
      initialCooldownSeconds={eligibility.limitReached ? 0 : eligibility.cooldownSecondsRemaining}
      initialLimitReached={eligibility.limitReached}
      initialManualStatus={initialManualStatus}
    />
  );
}

async function TokenResult({ token }: { token: string }) {
  const result = await verifyEmailToken(token);

  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This verification link has expired. Log in and request a new one from the verification screen."
        : result.reason === "invalid"
          ? "This verification link is invalid."
          : "This verification link is missing its token.";

    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <XCircle className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">Verification failed</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button href="/verify-email" className="mt-2">
          Go to verification screen
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" />
      <p className="text-lg font-semibold">
        {result.alreadyVerified ? "Already verified" : "Email verified"}
      </p>
      <p className="text-sm text-muted-foreground">
        Your email address is confirmed. You have full access to your
        Xencodes account.
      </p>
      <Button href="/dashboard" className="mt-2">
        Go to dashboard
      </Button>
    </Card>
  );
}
