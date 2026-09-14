"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/product/combobox";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatNaira } from "@/lib/currency";
import { purchaseNumberAction, type PurchaseError } from "./actions";

/**
 * The dedicated buy interface: search the provider's full catalog, pick a
 * country that service is really available in, see the live price for
 * that exact pair, then buy it.
 *
 * Deliberately not the homepage component. That one renders a small
 * pre-priced set for speed and browsing. This one asks the server for
 * real inventory at each step, so what is offered here is what can
 * actually be bought.
 */

const errorCopy: Record<PurchaseError, string> = {
  login_required: "Log in to buy a number.",
  admin_account:
    "Admin accounts do not buy numbers. Use a customer account to shop.",
  unavailable: "That number just went out of stock. Try another country.",
  insufficient_balance:
    "Your wallet does not have enough for this number. Add funds and try again.",
  provider_unavailable:
    "The number provider is not responding right now. Try again in a moment.",
  price_changed:
    "The price changed while you were deciding. Check the new price and confirm again.",
  unknown: "Something went wrong. Nothing was charged, so please try again.",
};

interface ServiceOption {
  slug: string;
  name: string;
  color: string;
  category: string;
}

interface CountryOption {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  priceKobo: number;
  successRate?: number;
}

/**
 * A quote result carries the pair it was fetched for. Whether the UI is
 * "loading" is then derived by comparing that pair to the current
 * selection rather than tracked separately, so there is no window where
 * a price fetched for the previous country is displayed against the new
 * one.
 */
interface QuoteResult {
  serviceSlug: string;
  countrySlug: string;
  available: boolean;
  priceKobo?: number;
  message?: string;
}

export function BuyPanel({
  initialServices,
  initialServiceSlug,
  signedIn,
  walletBalanceKobo,
}: {
  initialServices: ServiceOption[];
  initialServiceSlug?: string;
  signedIn: boolean;
  walletBalanceKobo: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [services, setServices] = useState<ServiceOption[]>(initialServices);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [service, setService] = useState<ServiceOption | null>(
    () => initialServices.find((s) => s.slug === initialServiceSlug) ?? null,
  );

  // Countries are stored with the service they belong to, for the same
  // reason quotes are: it makes "still loading" a derived fact rather
  // than a flag that can disagree with the data next to it.
  const [countryData, setCountryData] = useState<{
    serviceSlug: string;
    list: CountryOption[];
  } | null>(null);
  const [country, setCountry] = useState<CountryOption | null>(null);

  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries =
    service && countryData?.serviceSlug === service.slug ? countryData.list : [];
  const countriesLoading = Boolean(
    service && countryData?.serviceSlug !== service.slug,
  );

  const quoteFresh =
    service &&
    country &&
    quoteResult?.serviceSlug === service.slug &&
    quoteResult?.countrySlug === country.slug
      ? quoteResult
      : null;
  const quoteLoading = Boolean(service && country && !quoteFresh);
  const priceKobo = quoteFresh?.available ? quoteFresh.priceKobo : undefined;

  // Each async step tags its own request so a slow earlier response cannot
  // land after a newer one and overwrite it with stale options.
  const serviceRequest = useRef(0);
  const countryRequest = useRef(0);
  const quoteRequest = useRef(0);

  const searchServices = useCallback((query: string) => {
    const token = ++serviceRequest.current;
    setServicesLoading(true);

    // Debounced by the caller's typing rhythm rather than a timer: the
    // request is cheap and the result is discarded unless it is the
    // newest one.
    fetch(`/api/inventory/services?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data: { services?: ServiceOption[] }) => {
        if (token !== serviceRequest.current) return;
        setServices(data.services ?? []);
      })
      .catch(() => {
        if (token === serviceRequest.current) setServices([]);
      })
      .finally(() => {
        if (token === serviceRequest.current) setServicesLoading(false);
      });
  }, []);

  // Countries depend on the chosen service: only the ones that service is
  // actually available in are ever offered.
  useEffect(() => {
    // Nothing chosen yet, so nothing to fetch. The country picker is
    // disabled until a service exists, so no stale list is reachable.
    if (!service) return;

    const token = ++countryRequest.current;
    const slug = service.slug;

    fetch(`/api/inventory/countries?service=${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data: { countries?: CountryOption[] }) => {
        if (token !== countryRequest.current) return;
        setCountryData({ serviceSlug: slug, list: data.countries ?? [] });
      })
      .catch(() => {
        if (token !== countryRequest.current) return;
        setCountryData({ serviceSlug: slug, list: [] });
      });
  }, [service]);

  // The price is fetched live for the exact pair, not read off the country
  // list, so the figure being confirmed is the current one.
  useEffect(() => {
    // A quote needs both halves of the pair. The price block below only
    // renders once both exist, so an earlier quote cannot be shown against
    // a different selection.
    if (!service || !country) return;

    const token = ++quoteRequest.current;
    const pair = { serviceSlug: service.slug, countrySlug: country.slug };

    fetch(
      `/api/inventory/quote?service=${encodeURIComponent(pair.serviceSlug)}&country=${encodeURIComponent(pair.countrySlug)}`,
    )
      .then((res) => res.json())
      .then((data: { available?: boolean; priceKobo?: number; message?: string }) => {
        if (token !== quoteRequest.current) return;
        setQuoteResult(
          data.available && typeof data.priceKobo === "number"
            ? { ...pair, available: true, priceKobo: data.priceKobo }
            : {
                ...pair,
                available: false,
                message: data.message ?? "Currently unavailable.",
              },
        );
      })
      .catch(() => {
        if (token !== quoteRequest.current) return;
        setQuoteResult({
          ...pair,
          available: false,
          message: "Could not check the price. Try again in a moment.",
        });
      });
  }, [service, country]);

  function buy() {
    if (!service || !country || priceKobo === undefined) return;

    if (!signedIn) {
      router.push(`/login?callbackUrl=/buy?service=${service.slug}`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await purchaseNumberAction(
        service.slug,
        country.slug,
        priceKobo,
      );

      if (result.error) {
        setError(errorCopy[result.error]);
        // A price that moved is not a dead end: show the new one so the
        // customer can decide against the current figure.
        if (result.error === "price_changed" && result.priceKobo !== undefined) {
          setQuoteResult({
            serviceSlug: service.slug,
            countrySlug: country.slug,
            available: true,
            priceKobo: result.priceKobo,
          });
        }
        return;
      }

      if (result.activationId) {
        router.push(`/buy?activation=${result.activationId}`);
        router.refresh();
      }
    });
  }

  const serviceOptions: ComboboxOption[] = services.map((item) => ({
    value: item.slug,
    label: item.name,
    hint: item.category,
    leading: (
      <ServiceLogo
        slug={item.slug}
        name={item.name}
        color={item.color}
        size="sm"
      />
    ),
  }));

  const countryOptions: ComboboxOption[] = countries.map((item) => ({
    value: item.slug,
    label: item.name,
    hint: item.dialCode,
    leading: (
      <span aria-hidden className="text-lg leading-none">
        {item.flag}
      </span>
    ),
    trailing: (
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatNaira(item.priceKobo)}
      </span>
    ),
  }));

  const selectedServiceOption =
    service && serviceOptions.find((o) => o.value === service.slug)
      ? serviceOptions.find((o) => o.value === service.slug)!
      : service
        ? {
            value: service.slug,
            label: service.name,
            hint: service.category,
            leading: (
              <ServiceLogo
                slug={service.slug}
                name={service.name}
                color={service.color}
                size="sm"
              />
            ),
          }
        : null;

  const selectedCountryOption = country
    ? {
        value: country.slug,
        label: country.name,
        hint: country.dialCode,
        leading: (
          <span aria-hidden className="text-lg leading-none">
            {country.flag}
          </span>
        ),
      }
    : null;

  const affordable = priceKobo !== undefined && walletBalanceKobo >= priceKobo;
  const canBuy = priceKobo !== undefined && (!signedIn || affordable);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Buy a number
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Search any service, pick a country, and see the exact price before you
        buy.
      </p>

      {signedIn ? (
        <div className="mt-5 flex items-center justify-between gap-3 border-b border-border pb-4">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Wallet balance
          </span>
          <span className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums">
              {formatNaira(walletBalanceKobo)}
            </span>
            <Link
              href="/dashboard/wallet"
              className="-my-2 py-2 text-xs font-medium text-forest underline-offset-4 hover:underline"
            >
              Add funds
            </Link>
          </span>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mint-soft px-4 py-3">
          <p className="text-sm text-forest">Log in to buy a number.</p>
          <span className="flex gap-2">
            <Button href="/login?callbackUrl=/buy" size="sm" variant="outline">
              Log in
            </Button>
            <Button href="/register" size="sm">
              Register
              <ArrowRight className="h-4 w-4" />
            </Button>
          </span>
        </div>
      )}

      <div className="mt-6 space-y-4">
        <Combobox
          label="Service"
          placeholder="Search services, for example Instagram"
          emptyMessage="No service matches that search."
          options={serviceOptions}
          value={selectedServiceOption}
          loading={servicesLoading}
          autoFocus={!initialServiceSlug}
          onQueryChange={searchServices}
          onChange={(option) => {
            const next = services.find((s) => s.slug === option.value);
            if (next) {
              setService(next);
              setCountry(null);
              setError(null);
            }
          }}
        />

        <Combobox
          label="Country"
          placeholder="Search countries"
          emptyMessage={
            countriesLoading
              ? "Checking availability..."
              : "No country has stock for this service right now."
          }
          options={countryOptions}
          value={selectedCountryOption}
          loading={countriesLoading}
          disabled={!service}
          disabledMessage="Choose a service first"
          onChange={(option) => {
            const next = countries.find((c) => c.slug === option.value);
            if (next) {
              setCountry(next);
              setError(null);
            }
          }}
        />
      </div>

      {/* Availability and price, only once there is a real pair to price. */}
      {service && country ? (
        <div className="mt-5 border-t border-border pt-4">
          {quoteLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking the current price
            </p>
          ) : quoteFresh && !quoteFresh.available ? (
            <div className="flex items-start gap-2.5 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-medium">Currently unavailable.</span>{" "}
                {quoteFresh.message}
              </span>
            </div>
          ) : priceKobo !== undefined ? (
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">You pay</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {formatNaira(priceKobo)}
                </p>
              </div>
              {country.successRate !== undefined ? (
                <p className="pb-1 text-xs text-muted-foreground">
                  {country.successRate}% of recent activations received a code
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {signedIn && priceKobo !== undefined && !affordable ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3">
          <p className="text-sm text-warning">
            Add {formatNaira(priceKobo - walletBalanceKobo)} to your wallet to
            buy this number.
          </p>
          <Button href="/dashboard/wallet" size="sm" variant="outline">
            Add funds
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        onClick={buy}
        disabled={!canBuy || pending}
        size="lg"
        className="mt-5 w-full"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Getting your number
          </>
        ) : (
          <>
            Get Number
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </div>
  );
}
