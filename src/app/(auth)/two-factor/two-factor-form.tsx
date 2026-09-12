"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyTwoFactorAction, type TwoFactorState } from "./actions";

const initialState: TwoFactorState = {};

export function TwoFactorForm() {
  const [state, formAction, pending] = useActionState(verifyTwoFactorAction, initialState);

  return (
    <Card className="p-7 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-muted text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Two-factor verification</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <form action={formAction} className="mt-6 space-y-4">
        <input
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          className="h-12 w-full rounded-md border border-border bg-background text-center text-lg tracking-[0.5em] outline-none ring-ring transition-shadow focus:ring-2"
          placeholder="------"
        />

        {state.error ? (
          <p className="text-center text-sm text-danger">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Verifying..." : "Verify"}
        </Button>
      </form>
    </Card>
  );
}
