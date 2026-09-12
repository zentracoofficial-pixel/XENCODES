"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  if (state.success) {
    return (
      <Card className="flex flex-col items-center gap-3 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to your inbox. Click it to activate
          your account.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Get started with Xencodes in under a minute.
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
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm outline-none transition-colors focus:border-mint focus:ring-2 focus:ring-mint/25"
            placeholder="••••••••"
          />
        </div>

        {state.error ? (
          <p className="text-sm text-danger">{state.error}</p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account..." : "Create account"}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="inline-block -my-3 py-3 font-medium text-forest hover:underline">
          Log in
        </Link>
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        By creating an account you agree to use Xencodes for legitimate
        verification and testing only.
      </p>
    </Card>
  );
}
