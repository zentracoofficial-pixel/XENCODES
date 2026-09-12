import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AvailabilityBadge } from "@/components/marketing/availability-badge";
import type { Country } from "@/data/types";

export function CountryCard({ country }: { country: Country }) {
  return (
    <Link href={`/countries/${country.slug}`} className="block group">
      <Card className="p-5 h-full transition-colors group-hover:border-primary/40 group-hover:bg-secondary">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{country.flag}</span>
            <div>
              <p className="font-semibold text-foreground">{country.name}</p>
              <p className="text-xs text-muted-foreground">
                {country.dialCode} &middot; {country.serviceCount} services
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <AvailabilityBadge status={country.availability} />
          <p className="text-sm text-muted-foreground">
            from <span className="font-semibold text-foreground">${country.priceFrom.toFixed(2)}</span>
          </p>
        </div>
      </Card>
    </Link>
  );
}
