import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingState {
  emailVerified: boolean;
  fundedWallet: boolean;
  boughtNumber: boolean;
}

/**
 * A small progress checklist for a new account, gone the moment every step
 * is done — never shown again to an established customer just because they
 * revisit the dashboard. Verifying email is shown as a step here but never
 * enforced as a gate: the existing "usable while unverified" rule and its
 * purchase limit (src/lib/verification.ts) are untouched by this — this is
 * encouragement, not a blocker.
 */
export function OnboardingChecklist({ emailVerified, fundedWallet, boughtNumber }: OnboardingState) {
  const steps = [
    { label: "Create your account", done: true, href: null },
    { label: "Verify your email", done: emailVerified, href: null },
    { label: "Add funds", done: fundedWallet, href: "/dashboard/wallet" },
    { label: "Choose a service", done: boughtNumber, href: "/dashboard/buy" },
    { label: "Buy your first number", done: boughtNumber, href: "/dashboard/buy" },
  ];

  if (steps.every((step) => step.done)) return null;

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-sm font-semibold">Get set up</p>
      <ul className="mt-2.5 space-y-2">
        {steps.map((step) => {
          const row = (
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  step.done ? "bg-forest text-white" : "border border-border text-transparent",
                )}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className={cn("text-sm", step.done ? "text-muted-foreground line-through" : "font-medium")}>
                {step.label}
              </span>
            </span>
          );
          return (
            <li key={step.label}>
              {!step.done && step.href ? (
                <Link href={step.href} className="hover:underline">
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
