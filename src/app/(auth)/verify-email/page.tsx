import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Verify email",
};

async function verifyToken(token: string | undefined) {
  if (!token) return { ok: false as const, message: "Missing verification token." };

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
  });

  if (!record || record.expiresAt < new Date()) {
    return {
      ok: false as const,
      message: "This verification link is invalid or has expired.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.delete({ where: { id: record.id } }),
  ]);

  return { ok: true as const };
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = await verifyToken(token);

  if (!result.ok) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <XCircle className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">Verification failed</p>
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <Button href="/register" variant="outline" className="mt-2">
          Back to sign up
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" />
      <p className="text-lg font-semibold">Email verified</p>
      <p className="text-sm text-muted-foreground">
        Your email address has been confirmed. You can now log in.
      </p>
      <Button href="/login" className="mt-2">
        Log in
      </Button>
    </Card>
  );
}
