"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNairaFromNaira } from "@/lib/currency";
import { setCountryEnabledAction } from "./actions";

const availabilityVariant = {
  available: "success",
  limited: "warning",
  unavailable: "outline",
} as const;

export function CountryRow({
  slug,
  name,
  flag,
  dialCode,
  availability,
  serviceCount,
  priceFromNaira,
  enabled,
}: {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  availability: "available" | "limited" | "unavailable";
  serviceCount: number;
  priceFromNaira: number;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr className={`border-b border-border last:border-0 hover:bg-secondary/40 ${enabled ? "" : "opacity-60"}`}>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-xl leading-none">{flag}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{dialCode}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <Badge variant={availabilityVariant[availability]}>{availability}</Badge>
      </td>
      <td className="px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground">
        {serviceCount} services
      </td>
      <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums">
        {enabled && serviceCount > 0 ? (
          formatNairaFromNaira(priceFromNaira)
        ) : (
          <span className="font-normal text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right">
        <Button
          variant={enabled ? "outline" : "primary"}
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => setCountryEnabledAction(slug, !enabled))}
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
}
