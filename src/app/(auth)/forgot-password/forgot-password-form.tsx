"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.success) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <MailCheck className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Check your email</p>
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, we&apos;ve sent a link to reset
          your password.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            placeholder="you@company.com"
          />
        </div>

        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to login
      </Link>
    </Card>
  );
}
