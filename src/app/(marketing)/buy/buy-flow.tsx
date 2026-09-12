"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Search, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { AvailabilityDot } from "@/components/marketing/availability-badge";
import { formatNairaFromNaira } from "@/lib/currency";
import { purchaseNumberAction } from "./actions";
import type { Service, Country } from "@/data/types";

type Step = "service" | "country" | "confirm";

const stepOrder: Step[] = ["service", "country", "confirm"];
const stepLabels: Record<Step, string> = {
  service: "Service",
  country: "Country",
  confirm: "Confirm",
};

function StepRail({ current, onJump }: { current: Step; onJump: (step: Step) => void }) {
  const currentIndex = stepOrder.indexOf(current);

  return (
    <ol className="flex items-center gap-2">
      {stepOrder.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!done}
              onClick={() => done && onJump(step)}
              className={cn(
                "flex items-center gap-2 text-xs font-medium transition-colors",
                done && "text-foreground hover:text-primary",
                active && "text-primary",
                !done && !active && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px]",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary-muted text-primary",
                  !done && !active && "border-border",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{stepLabels[step]}</span>
            </button>
            {index < stepOrder.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px flex-1", done ? "bg-primary/40" : "bg-border")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

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
          initialService.availability.some(
            (a) => a.countrySlug === c.slug && a.status !== "unavailable",
          ),
      ) ?? null
    : null;

  const [step, setStep] = useState<Step>(
    initialService ? (initialCountry ? "confirm" : "country") : "service",
  );
  const [service, setService] = useState<Service | null>(initialService);
  const [country, setCountry] = useState<Country | null>(initialCountry);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
  }, [services, query]);

  const availableCountries = useMemo(() => {
    if (!service) return [];
    return countries
      .map((c) => ({
        country: c,
        availability: service.availability.find((a) => a.countrySlug === c.slug),
      }))
      .filter((entry) => entry.availability && entry.availability.status !== "unavailable")
      .sort((a, b) => a.availability!.priceNaira - b.availability!.priceNaira);
  }, [service, countries]);

  const selectedAvailability = service?.availability.find(
    (a) => a.countrySlug === country?.slug,
  );

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
      setError(result.error ?? "unknown");
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <StepRail current={step} onJump={setStep} />
      </div>

      <Card className="overflow-hidden">
        {step === "service" ? (
          <div>
            <div className="border-b border-border p-5">
              <h1 className="text-lg font-semibold">Which service are you verifying?</h1>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${services.length} services…`}
                  className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none ring-ring transition-shadow focus:ring-2"
                />
              </div>
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {filteredServices.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Nothing matches “{query}”.
                </p>
              ) : (
                filteredServices.map((s) => (
                  <button
                    key={s.slug}
                    type="button"
                    onClick={() => {
                      setService(s);
                      setCountry(null);
                      setStep("country");
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3 text-left transition-colors last:border-0 hover:bg-secondary"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <ServiceLogo service={s} size="md" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {s.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.category}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatNairaFromNaira(s.priceFromNaira)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {step === "country" && service ? (
          <div>
            <div className="border-b border-border p-5">
              <button
                type="button"
                onClick={() => setStep("service")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Change service
              </button>
              <div className="mt-3 flex items-center gap-3">
                <ServiceLogo service={service} size="lg" />
                <div>
                  <h1 className="text-lg font-semibold">{service.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    Pick where the number should come from
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[26rem] overflow-y-auto">
              {availableCountries.map(({ country: c, availability }) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => {
                    setCountry(c);
                    setStep("confirm");
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-secondary"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl leading-none">{c.flag}</span>
                    <span>
                      <span className="block text-sm font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.dialCode} · ~{availability!.avgDeliverySeconds}s delivery
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-4">
                    <AvailabilityDot status={availability!.status} />
                    <span className="text-sm font-semibold tabular-nums">
                      {formatNairaFromNaira(availability!.priceNaira)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === "confirm" && service && country && selectedAvailability ? (
          <div className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setStep("country")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change country
            </button>

            <div className="mt-4 flex items-center gap-3">
              <ServiceLogo service={service} size="lg" />
              <div>
                <h1 className="text-lg font-semibold">{service.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {country.flag} {country.name} · {country.dialCode}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Availability</dt>
                <dd>
                  <AvailabilityDot status={selectedAvailability.status} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Typical delivery</dt>
                <dd className="font-medium tabular-nums">
                  ~{selectedAvailability.avgDeliverySeconds}s
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <dt className="text-muted-foreground">You pay</dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {formatNairaFromNaira(selectedAvailability.priceNaira)}
                </dd>
              </div>
            </dl>

            {error === "insufficient_balance" ? (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-muted p-3.5 text-sm">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <p className="text-danger">
                  Not enough in your wallet.{" "}
                  <Link href="/dashboard/wallet" className="font-medium underline">
                    Add funds
                  </Link>{" "}
                  and come back — your selection is saved.
                </p>
              </div>
            ) : null}
            {error === "unavailable" ? (
              <p className="mt-4 rounded-lg border border-danger/30 bg-danger-muted p-3.5 text-sm text-danger">
                That number just went out of stock. Pick another country.
              </p>
            ) : null}
            {error === "unknown" ? (
              <p className="mt-4 rounded-lg border border-danger/30 bg-danger-muted p-3.5 text-sm text-danger">
                Something went wrong on our side. Please try again.
              </p>
            ) : null}

            <Button
              onClick={handlePurchase}
              disabled={isPending}
              size="lg"
              className="mt-5 w-full"
            >
              {isPending ? "Reserving your number…" : "Buy this number"}
              {!isPending && <ArrowRight className="h-4 w-4" />}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              No code within the session? Cancel it and you&apos;re refunded in full.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
