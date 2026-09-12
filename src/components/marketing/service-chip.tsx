import Link from "next/link";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatNairaFromNaira } from "@/lib/currency";
import type { Service } from "@/data/types";

export function ServiceChip({ service }: { service: Service }) {
  return (
    <Link
      href={`/buy?service=${service.slug}`}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <ServiceLogo service={service} size="sm" />
        <span className="truncate text-sm font-medium">{service.name}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
        {formatNairaFromNaira(service.priceFromNaira)}
      </span>
    </Link>
  );
}
