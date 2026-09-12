"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setCountryEnabledAction } from "./actions";

export function CountryRow({
  slug,
  name,
  flag,
  dialCode,
  serviceCount,
  enabled,
}: {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  serviceCount: number;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr
      className={`border-b border-border last:border-0 hover:bg-background ${
        enabled ? "" : "opacity-55"
      }`}
    >
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-lg leading-none">
            {flag}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {dialCode}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">
        {serviceCount} services
      </td>
      <td className="px-5 py-3 text-right">
        <Button
          variant={enabled ? "outline" : "primary"}
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => setCountryEnabledAction(slug, !enabled))
          }
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
      </td>
    </tr>
  );
}
