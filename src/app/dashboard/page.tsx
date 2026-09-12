import type { Metadata } from "next";
import Link from "next/link";
import { Smartphone, ShieldCheck, ShieldAlert, MailCheck, MailWarning } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
  });

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-secondary/30">
      <header className="border-b border-border bg-background">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Smartphone className="h-4 w-4" />
            </span>
            Xencodes
          </Link>
          <LogoutButton />
        </Container>
      </header>

      <main className="flex-1 py-10">
        <Container>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{user.name ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This is a placeholder dashboard confirming your account and
            session are working. The full customer dashboard (numbers,
            activations, wallet, inbox) is a follow-up phase.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard label="Wallet balance" value={`$${(user.walletBalanceCents / 100).toFixed(2)}`} />
            <StatCard
              label="Email status"
              value={
                user.emailVerified ? (
                  <Badge variant="success">Verified</Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )
              }
            />
            <StatCard
              label="Two-factor authentication"
              value={
                user.twoFactorEnabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )
              }
            />
          </div>

          <Card className="mt-8 p-6">
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <dt className="text-muted-foreground">Account created</dt>
                <dd className="font-medium">
                  {user.createdAt.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Email verification</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  {user.emailVerified ? (
                    <>
                      <MailCheck className="h-4 w-4 text-success" />
                      Verified
                    </>
                  ) : (
                    <>
                      <MailWarning className="h-4 w-4 text-warning" />
                      Not verified
                    </>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between pt-3">
                <dt className="text-muted-foreground">Two-factor authentication</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  {user.twoFactorEnabled ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-success" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                      Not enabled
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </Container>
      </main>
    </div>
  );
}
