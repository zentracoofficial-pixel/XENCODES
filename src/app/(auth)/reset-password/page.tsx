import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <XCircle className="h-10 w-10 text-danger" />
        <p className="text-lg font-semibold">Invalid link</p>
        <p className="text-sm text-muted-foreground">
          This password reset link is missing its token.
        </p>
        <Button href="/forgot-password" variant="outline" className="mt-2">
          Request a new link
        </Button>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}
