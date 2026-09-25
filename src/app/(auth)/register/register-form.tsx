"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { registerAction, type RegisterState } from "./actions";
import type { CurrencyCode } from "@/lib/currency-config";

const initialState: RegisterState = {};

export function RegisterForm({
  suggestedCurrency,
  usdFundingAvailable,
}: {
  /** NGN or USD, guessed from the request's own detected location. A
   *  starting selection, never an assignment: geo-IP is wrong often enough
   *  that the visitor can still pick the other option themselves. */
  suggestedCurrency: CurrencyCode;
  /** Whether a USD-capable payment provider is actually connected right
   *  now. False today; shown honestly below rather than left unsaid, so
   *  nobody registers expecting to fund a USD wallet that cannot yet be
   *  funded. */
  usdFundingAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  const options: { value: CurrencyCode; title: string; subtitle: string }[] = [
    {
      value: "NGN",
      title: "Nigeria",
      subtitle: "Wallet and pricing in NGN, funded via card, transfer or USSD.",
    },
    {
      value: "USD",
      title: "Outside Nigeria",
      subtitle: usdFundingAvailable
        ? "Wallet and pricing in USD."
        : "Wallet and pricing in USD. Funding isn't connected yet, so you can browse and see prices, but not add funds yet.",
    },
  ];

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

        <fieldset>
          <legend className="text-sm font-medium">Where are you?</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface p-3 text-sm transition-colors has-[:checked]:border-mint has-[:checked]:bg-mint-soft"
              >
                <input
                  type="radio"
                  name="currency"
                  value={option.value}
                  defaultChecked={option.value === suggestedCurrency}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="block font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.subtitle}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            This sets your wallet and pricing currency. It cannot be changed
            later.
          </p>
        </fieldset>

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
