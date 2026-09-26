"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

/**
 * The "Where are you?" NGN/USD picker is intentionally hidden here, not
 * removed: there is no USD-capable payment provider connected yet, so
 * offering the choice only invites someone to pick a USD wallet they can't
 * fund. Every visitor now gets registerAction's own silent geo-IP fallback
 * (currencyForCountry(requestCountry()) in src/app/(auth)/register/actions.ts)
 * with no explicit override. The USD currency architecture itself —
 * currency-config.ts, the wallet, pricing — is untouched; bring the picker
 * back once a USD provider exists by restoring this fieldset and passing it
 * suggestedCurrency/usdFundingAvailable again (see git history).
 */
export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

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
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5"
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
