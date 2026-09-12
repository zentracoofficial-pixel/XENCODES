"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { formatNairaFromNaira } from "@/lib/currency";
import type { Country, Service } from "@/data/types";

function Field({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex-1">
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="relative mt-1.5 block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-lg border border-border bg-background pl-3 pr-9 text-sm font-medium outline-none ring-ring transition-shadow focus:ring-2"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </span>
    </label>
  );
}

export function PricePicker({
  services,
  countries,
}: {
  services: Service[];
  countries: Country[];
}) {
  const router = useRouter();
  const [serviceSlug, setServiceSlug] = useState("whatsapp");
  const [countrySlug, setCountrySlug] = useState("nigeria");

  const service = services.find((s) => s.slug === serviceSlug) ?? services[0];

  // Only offer countries this service can actually deliver to.
  const offeredCountries = useMemo(
    () =>
      countries.filter((c) =>
        service.availability.some(
          (a) => a.countrySlug === c.slug && a.status !== "unavailable",
        ),
      ),
    [countries, service],
  );

  const availability =
    service.availability.find((a) => a.countrySlug === countrySlug) ?? null;
  const isOffered = availability !== null && availability.status !== "unavailable";

  // If the chosen country can't serve the chosen service, fall back to the
  // first one that can, so the picker never shows a dead end.
  const effectiveCountry = isOffered
    ? countries.find((c) => c.slug === countrySlug)!
    : offeredCountries[0];
  const effectiveAvailability = isOffered
    ? availability
    : service.availability.find((a) => a.countrySlug === effectiveCountry?.slug) ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card p-2 shadow-xl shadow-primary/5">
      <div className="rounded-xl bg-background/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <Field label="Service" value={serviceSlug} onChange={setServiceSlug}>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Field>
          <Field
            label="Country"
            value={effectiveCountry?.slug ?? ""}
            onChange={setCountrySlug}
          >
            {offeredCountries.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.flag} {c.name}
              </option>
            ))}
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live price
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {effectiveAvailability
                  ? formatNairaFromNaira(effectiveAvailability.priceNaira)
                  : "—"}
              </span>
              <span className="text-sm text-muted-foreground">per code</span>
            </p>
            {effectiveAvailability ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <AvailabilityDot status={effectiveAvailability.status} />
                <span>~{effectiveAvailability.avgDeliverySeconds}s average delivery</span>
              </p>
            ) : null}
          </div>

          <Button
            size="lg"
            onClick={() =>
              router.push(
                `/buy?service=${service.slug}&country=${effectiveCountry?.slug ?? ""}`,
              )
            }
          >
            Get this number
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
