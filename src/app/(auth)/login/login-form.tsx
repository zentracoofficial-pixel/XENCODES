"use client";

import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

/** Why the customer was sent here rather than a plain "log in" — set by a
 *  signOut() redirect from an action that just invalidated every session
 *  (see logoutEverywhereAction and changePasswordAction), so this doesn't
 *  read as an unexplained forced logout. */
const REASON_COPY: Record<string, string> = {
  password_changed: "Your password was changed. Please sign in again.",
  logged_out_everywhere: "You've been logged out of every device. Please sign in again.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const reason = searchParams.get("reason");
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  useEffect(() => {
    if (state.requiresTwoFactor) {
      router.push("/two-factor");
    }
  }, [state.requiresTwoFactor, router]);

  return (
    <Card className="p-7 sm:p-8">
      <h1 className="text-xl font-semibold">Log in to Xencodes</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Welcome back. Enter your details to access your dashboard.
      </p>

      {reason && REASON_COPY[reason] ? (
        <p className="mt-4 rounded-lg bg-mint-soft px-3.5 py-2.5 text-sm text-forest">
          {REASON_COPY[reason]}
        </p>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="-my-3 py-3 text-xs text-forest hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1.5"
            placeholder="••••••••"
          />
        </div>

        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Logging in..." : "Log in"}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="inline-block -my-3 py-3 font-medium text-forest hover:underline">
          Create one
        </Link>
      </p>
    </Card>
  );
}
