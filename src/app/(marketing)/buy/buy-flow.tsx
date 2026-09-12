"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { purchaseNumberAction } from "./actions";
import type { Service, Country } from "@/data/types";

type Step = "service" | "country" | "confirm";

export function BuyFlow({
  services,
  countries,
  initialServiceSlug,
  initialCountrySlug,
}: {
  services: Service[];
  countries: Country[];
  initialServiceSlug?: string;
  initialCountrySlug?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialService = services.find((s) => s.slug === initialServiceSlug) ?? null;
  const initialCountry = initialService
    ? countries.find(
        (c) =>
          c.slug === initialCountrySlug &&
          initialService.availability.some((a) => a.countrySlug === c.slug && a.status !== "unavailable"),
      ) ?? null
    : null;

  const [step, setStep] = useState<Step>(initialService ? (initialCountry ? "confirm" : "country") : "service");
  const [service, setService] = useState<Service | null>(initialService);
  const [country, setCountry] = useState<Country | null>(initialCountry);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredServices = useMemo(
    () => services.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())),
    [services, query],
  );

  const availableCountries = useMemo(() => {
    if (!service) return [];
    return countries
      .map((c) => ({
        country: c,
        availability: service.availability.find((a) => a.countrySlug === c.slug),
      }))
      .filter((entry) => entry.availability && entry.availability.status !== "unavailable");
  }, [service, countries]);

  const selectedAvailability = service?.availability.find((a) => a.countrySlug === country?.slug);

  function handlePurchase() {
    if (!service || !country) return;
    setError(null);
    startTransition(async () => {
      const result = await purchaseNumberAction(service.slug, country.slug);
      if (result.activationId) {
        router.push(`/buy?activation=${result.activationId}`);
        return;
      }
      if (result.error === "login_required") {
        const target = `/buy?service=${service.slug}&country=${country.slug}`;
        router.push(`/login?callbackUrl=${encodeURIComponent(target)}`);
        return;
      }
      if (result.error === "insufficient_balance") {
        setError("insufficient_balance");
        return;
      }
      setError("unavailable");
    });
  }

  return (
    <Card className="mx-auto max-w-xl p-6 sm:p-8">
      {step === "service" ? (
        <div>
          <h1 className="text-xl font-semibold">Choose a service</h1>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services..."
              className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
            />
          </div>
          <div className="mt-4 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {filteredServices.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => {
                  setService(s);
                  setCountry(null);
                  setStep("country");
                }}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm font-medium hover:border-primary/40 hover:bg-secondary transition-colors"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.name.slice(0, 1)}
                </span>
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "country" && service ? (
        <div>
          <button
            type="button"
            onClick={() => setStep("service")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="mt-3 text-xl font-semibold">Select a country</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Available countries for {service.name}
          </p>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {availableCountries.map(({ country: c, availability }) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  setCountry(c);
                  setStep("confirm");
                }}
                className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left hover:border-primary/40 hover:bg-secondary transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xl leading-none">{c.flag}</span>
                  <span>
                    <span className="block text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">{c.dialCode}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <AvailabilityDot status={availability!.status} />
                  <span className="text-sm font-semibold">${availability!.price.toFixed(2)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "confirm" && service && country && selectedAvailability ? (
        <div>
          <button
            type="button"
            onClick={() => setStep("country")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="mt-3 text-xl font-semibold">Confirm your number</h1>

          <div className="mt-4 space-y-3 rounded-lg border border-border bg-secondary/40 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Service</span>
              <span className="font-medium">{service.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Country</span>
              <span className="font-medium">
                {country.flag} {country.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Availability</span>
              <AvailabilityDot status={selectedAvailability.status} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-muted-foreground">Price</span>
              <span className="text-lg font-semibold">${selectedAvailability.price.toFixed(2)}</span>
            </div>
          </div>

          {error === "insufficient_balance" ? (
            <p className="mt-4 text-sm text-danger">
              Your wallet balance is too low.{" "}
              <a href="/dashboard/wallet" className="underline">
                Add funds
              </a>{" "}
              to continue.
            </p>
          ) : null}
          {error === "unavailable" ? (
            <p className="mt-4 text-sm text-danger">
              This number is no longer available. Please choose another country.
            </p>
          ) : null}
          {error === "unknown" ? (
            <p className="mt-4 text-sm text-danger">Something went wrong. Please try again.</p>
          ) : null}

          <Button onClick={handlePurchase} disabled={isPending} size="lg" className="mt-5 w-full">
            {isPending ? "Purchasing..." : "Purchase number"}
            {!isPending && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
