"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { formatMultiplier, multiplierToMarginPercent } from "@/lib/price-multiplier";
import { PriceInput } from "@/components/admin/price-input";
import { cn } from "@/lib/utils";
import {
  previewServicePriceAction,
  setServiceEnabledAction,
  setServiceMarginAction,
  type MarginState,
} from "./actions";

const initial: MarginState = {};

/** The column template shared by the list header and every row (xl and up).
 *  Below xl each row is a stacked card. */
export const SERVICE_GRID =
  "xl:grid xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(13.5rem,1.3fr)] xl:items-center xl:gap-4";

/**
 * One service: who it is, what the provider charges, what the customer pays,
 * which pricing rule applies, how often it sold, and the two things an admin
 * can do to it (set its own price, switch it off). The price editor opens
 * under the row, full width, so its live preview has room.
 */
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
  /** The service's own multiple, or null when it follows the platform rules. */
  overrideMultiplier,
  /** What actually applies right now, after the rules are resolved. */
  effectiveMultiplier,
  ruleLabel,
  completed30d,
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
  overrideMultiplier: number | null;
  effectiveMultiplier: number;
  ruleLabel: string;
  /** Orders for this service that delivered a code in the last 30 days. */
  completed30d: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const bound = setServiceMarginAction.bind(null, slug);
  const [state, formAction, formPending] = useActionState(bound, initial);

  const ruleVariant = ruleLabel === "Service override" ? "default" : ruleLabel === "Exclusive tier" ? "forest" : "neutral";

  return (
    <li className={cn("border-b border-border last:border-0", !enabled && "bg-background/60")}>
      <div className={cn("px-4 py-4 sm:px-5", SERVICE_GRID)}>
        {/* Service */}
        <div className="flex items-start justify-between gap-3 xl:items-center">
          <div className={cn("flex min-w-0 items-center gap-3", !enabled && "opacity-60")}>
            <ServiceLogo slug={slug} name={name} color={color} size="sm" />
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold">{name}</span>
                <span className="hidden shrink-0 xl:inline-flex">
                  <StatusPill enabled={enabled} />
                </span>
              </p>
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{category}</span>
                {providerServiceId ? (
                  <code className="shrink-0 rounded bg-background px-1.5 py-px font-mono text-[11px] text-foreground/70">
                    {providerServiceId}
                  </code>
                ) : null}
              </p>
            </div>
          </div>
          <span className="xl:hidden">
            <StatusPill enabled={enabled} />
          </span>
        </div>

        {/* Figures: a 2x2 grid on cards, their own columns on xl */}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-border bg-background px-3.5 py-3 sm:grid-cols-4 xl:contents">
          <Figure label="Provider cost">
            {cheapestCostKobo !== null ? formatMoney(cheapestCostKobo, currency) : <Dash />}
          </Figure>
          <Figure label="Customer price">
            {cheapestCustomerPriceKobo !== null ? (
              <span className="font-semibold text-forest">{formatMoney(cheapestCustomerPriceKobo, currency)}</span>
            ) : (
              <Dash />
            )}
          </Figure>
          <Figure label="Pricing">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{formatMultiplier(effectiveMultiplier)}</span>
              <span className="text-xs text-muted-foreground">{multiplierToMarginPercent(effectiveMultiplier)}%</span>
            </span>
            <Badge variant={ruleVariant} className="mt-1">
              {ruleLabel}
            </Badge>
          </Figure>
          <Figure label="Sold, 30 days">
            {completed30d > 0 ? (
              <span className="font-semibold">{completed30d.toLocaleString("en-NG")}</span>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </Figure>
        </dl>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2 xl:mt-0 xl:flex-nowrap xl:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
            aria-controls={`price-${slug}`}
          >
            <Pencil className="h-3.5 w-3.5" />
            Price
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", editing && "rotate-180")} />
          </Button>
          <Button
            variant={enabled ? "outline" : "primary"}
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => setServiceEnabledAction(slug, !enabled))}
            className={cn(enabled && "text-danger hover:border-danger/50 hover:bg-danger-soft")}
          >
            {isPending ? "Saving" : enabled ? "Switch off" : "Switch on"}
          </Button>
        </div>
      </div>

      {state.summary && !editing ? (
        <p className="-mt-2 px-4 pb-3 text-xs text-success sm:px-5">{state.summary}</p>
      ) : null}

      {editing ? (
        <div id={`price-${slug}`} className="border-t border-dashed border-border bg-background/70 px-4 py-4 sm:px-5">
          <form action={formAction} className="space-y-3">
            <div>
              <p className="text-sm font-medium">Price for {name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Type a multiple of the provider&apos;s cost or a margin percent. Leave it empty to follow the{" "}
                {ruleLabel === "Service override" ? "platform rules" : ruleLabel.toLowerCase()} again.
                {overrideMultiplier !== null
                  ? ` Its own price now: ${formatMultiplier(overrideMultiplier)}.`
                  : " It follows the platform rules now."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <PriceInput
                name="price"
                initialMultiplier={overrideMultiplier}
                placeholder="auto"
                ariaLabel={`${name} price, as a multiple of provider cost or a margin percent`}
                preview={(raw, unit) => previewServicePriceAction(slug, raw, unit)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={formPending}>
                {formPending ? "Saving" : "Save price"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Close
              </Button>
              {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
              {state.summary ? <p className="text-xs text-success">{state.summary}</p> : null}
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-sm tabular-nums">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground xl:sr-only">{label}</dt>
      <dd className="mt-0.5 xl:mt-0">{children}</dd>
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="success">
      <span className="h-1.5 w-1.5 rounded-full bg-success" />
      On sale
    </Badge>
  ) : (
    <Badge variant="neutral">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      Switched off
    </Badge>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}
