"use client";

import { useActionState, useTransition } from "react";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import {
  setServiceEnabledAction,
  setServiceMarginAction,
  type MarginState,
} from "./actions";

const initial: MarginState = {};

export function ServiceRow({
  slug,
  name,
  color,
  category,
  providerServiceId,
  currency,
  cheapestCostKobo,
  cheapestCustomerPriceKobo,
  enabled,
  /** The service's own margin, or null when it follows the platform rules. */
  overridePercent,
  /** What actually applies right now, after the rules are resolved. */
  effectivePercent,
  ruleLabel,
}: {
  slug: string;
  name: string;
  color: string;
  category: string;
  /** The supplier's own code for this service, when the adapter reports
   *  one. Reconciliation detail for the admin, never shown to a customer. */
  providerServiceId?: string | null;
  /** The platform's default currency (see src/lib/currency-config.ts), the
   *  one every figure in this row is shown in. Illustrative only: the
   *  country picked at purchase decides the real price and currency. */
  currency: string;
  /** Cheapest live cost anywhere for this service, converted into
   *  `currency`'s minor unit. Null when the provider has not priced it or
   *  is not connected. */
  cheapestCostKobo: number | null;
  /** What quoteForCurrency() turns that cheapest cost into at the resolved
   *  margin. Illustrative, since the country picked at purchase decides
   *  the real price; never used to charge anyone. */
  cheapestCustomerPriceKobo: number | null;
  enabled: boolean;
  overridePercent: number | null;
  effectivePercent: number;
  ruleLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const bound = setServiceMarginAction.bind(null, slug);
  const [state, formAction, formPending] = useActionState(bound, initial);

  return (
    <tr
      className={`border-b border-border last:border-0 hover:bg-background ${
        enabled ? "" : "opacity-55"
      }`}
    >
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <ServiceLogo slug={slug} name={name} color={color} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{category}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {providerServiceId ? (
          <code className="rounded bg-background px-1.5 py-0.5 text-xs">
            {providerServiceId}
          </code>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">
        {cheapestCostKobo !== null ? formatMoney(cheapestCostKobo, currency) : "—"}
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">
        {cheapestCustomerPriceKobo !== null
          ? formatMoney(cheapestCustomerPriceKobo, currency)
          : "—"}
      </td>
      <td className="px-3 py-3">
        <Badge variant={ruleLabel === "Exclusive tier" ? "forest" : "neutral"}>
          {ruleLabel}
        </Badge>
      </td>
      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums">
        {effectivePercent}%
      </td>
      <td className="px-3 py-3">
        <form action={formAction} className="flex items-center justify-end gap-2">
          <input
            name="grossMarginPercent"
            type="number"
            step="1"
            min="0"
            max="95"
            defaultValue={overridePercent ?? ""}
            placeholder="auto"
            aria-label={`${name} gross margin percent`}
            className="h-10 w-20 rounded-lg border border-border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          <Button type="submit" variant="outline" size="sm" disabled={formPending}>
            {formPending ? "Saving" : "Save"}
          </Button>
        </form>
        {state.error ? (
          <p className="mt-1 text-right text-xs text-danger">{state.error}</p>
        ) : null}
      </td>
      <td className="px-5 py-3 text-right">
        <Button
          variant={enabled ? "outline" : "primary"}
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => setServiceEnabledAction(slug, !enabled))
          }
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
}
