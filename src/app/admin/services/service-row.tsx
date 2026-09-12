"use client";

import { useActionState, useTransition } from "react";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { Button } from "@/components/ui/button";
import { formatNairaFromNaira } from "@/lib/currency";
import { setServiceEnabledAction, setServiceMarkupAction, type MarkupState } from "./actions";

const markupInitial: MarkupState = {};

export function ServiceRow({
  slug,
  name,
  color,
  basePriceNaira,
  enabled,
  markupPercent,
  livePriceNaira,
}: {
  slug: string;
  name: string;
  color: string;
  basePriceNaira: number;
  enabled: boolean;
  markupPercent: number;
  livePriceNaira: number;
}) {
  const [isPending, startTransition] = useTransition();
  const boundMarkup = setServiceMarkupAction.bind(null, slug);
  const [state, formAction, formPending] = useActionState(boundMarkup, markupInitial);

  return (
    <tr
      className={`border-b border-border last:border-0 hover:bg-background ${
        enabled ? "" : "opacity-55"
      }`}
    >
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <ServiceLogo slug={slug} name={name} color={color} size="sm" />
          <span className="truncate text-sm font-medium">{name}</span>
        </div>
      </td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
        {formatNairaFromNaira(basePriceNaira)}
      </td>
      <td className="px-5 py-3">
        <form action={formAction} className="flex items-center justify-end gap-2">
          <input
            name="markupPercent"
            type="number"
            step="1"
            defaultValue={markupPercent}
            aria-label={`${name} markup percent`}
            className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-mint focus:ring-2 focus:ring-mint/25"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button type="submit" variant="outline" size="sm" disabled={formPending}>
            {formPending ? "Saving" : "Save"}
          </Button>
        </form>
        {state.error ? (
          <p className="mt-1 text-right text-xs text-danger">{state.error}</p>
        ) : null}
      </td>
      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums">
        {enabled ? (
          formatNairaFromNaira(livePriceNaira)
        ) : (
          <span className="font-normal text-muted-foreground">off</span>
        )}
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
