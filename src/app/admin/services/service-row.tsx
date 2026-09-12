"use client";

import { useActionState, useTransition } from "react";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { Button } from "@/components/ui/button";
import { formatNairaFromNaira } from "@/lib/currency";
import { setServiceEnabledAction, setServiceMarkupAction, type MarkupState } from "./actions";

const markupInitial: MarkupState = {};

export function ServiceRow({
  service,
  basePriceNaira,
  enabled,
  markupPercent,
  livePriceNaira,
}: {
  service: { slug: string; name: string; color: string; colorDark?: string };
  basePriceNaira: number;
  enabled: boolean;
  markupPercent: number;
  livePriceNaira: number;
}) {
  const [isPending, startTransition] = useTransition();
  const boundMarkup = setServiceMarkupAction.bind(null, service.slug);
  const [state, formAction, formPending] = useActionState(boundMarkup, markupInitial);

  return (
    <tr className={`border-b border-border last:border-0 hover:bg-secondary/40 ${enabled ? "" : "opacity-60"}`}>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <ServiceLogo service={service} size="sm" />
          <span className="truncate text-sm font-medium">{service.name}</span>
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
            aria-label={`${service.name} markup percent`}
            className="h-8 w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums outline-none ring-ring transition-shadow focus:ring-2"
          />
          <span className="text-xs text-muted-foreground">%</span>
          <Button type="submit" variant="outline" size="sm" disabled={formPending}>
            {formPending ? "…" : "Save"}
          </Button>
        </form>
        {state.error ? <p className="mt-1 text-right text-xs text-danger">{state.error}</p> : null}
      </td>
      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums">
        {enabled ? formatNairaFromNaira(livePriceNaira) : <span className="font-normal text-muted-foreground">—</span>}
      </td>
      <td className="px-5 py-3 text-right">
        <Button
          variant={enabled ? "outline" : "primary"}
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => setServiceEnabledAction(service.slug, !enabled))}
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
}
