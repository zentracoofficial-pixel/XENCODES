import Link from "next/link";
import type { Service } from "@/data/types";

export function ServiceChip({ service }: { service: Service }) {
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-secondary"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
        style={{ backgroundColor: service.color }}
      >
        {service.name.slice(0, 1)}
      </span>
      <span className="text-sm font-medium text-foreground">
        {service.name}
      </span>
    </Link>
  );
}
