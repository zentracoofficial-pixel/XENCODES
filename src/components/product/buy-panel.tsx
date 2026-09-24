"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/product/combobox";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatNaira } from "@/lib/currency";
import {
  purchaseNumberAction,
  type PurchaseError,
} from "@/app/dashboard/buy/actions";

/**
 * The buy interface: search the live catalog, pick a country that service
 * is really available in, see the live price for that exact pair, then buy
 * it.
 *
 * Every step asks the server for real inventory, so what is offered here
 * is what can actually be bought. When no number provider is connected the
 * same structure renders with everything disabled and the reason stated,
 * rather than a form that looks ready and fails on submit.
 */

const errorCopy: Record<PurchaseError, string> = {
  login_required: "Log in to buy a number.",
  admin_account:
    "Admin accounts do not buy numbers. Use a customer account to shop.",
  no_provider:
    "Numbers are not on sale right now. Nothing was charged to your wallet.",
  unavailable: "That number just went out of stock. Try another country.",
  unpriceable:
    "We could not confirm the price for that number, so the order was not placed. Try another country.",
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
  popular?: boolean;
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
  unavailableMessage,
  basePath = "/buy",
  walletHref = "/dashboard/wallet",
}: {
  initialServices: ServiceOption[];
  initialServiceSlug?: string;
  signedIn: boolean;
  walletBalanceKobo: number;
  /** Set when no number provider is connected. Every control is disabled
   *  and this is shown, so the page never looks ready to sell something
   *  there is no supplier behind. */
  unavailableMessage?: string;
  /** Where an activation is shown once bought. The dashboard keeps the
   *  customer inside its own shell, the public route does not. */
  basePath?: string;
  walletHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [services, setServices] = useState<ServiceOption[]>(initialServices);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState(false);
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
  // Tags which service a failure belongs to, the same way countryData
  // tags its own list, so switching services doesn't show a stale error
  // left over from a previous one.
  const [countriesErrorFor, setCountriesErrorFor] = useState<string | null>(null);
  const countriesError = Boolean(service && countriesErrorFor === service.slug);
  // The full country list for a service is small enough (typically well
  // under a few hundred rows) to already be sitting in the browser once
  // fetched, so filtering it against what's typed is done here rather than
  // firing another request per keystroke, unlike the service catalog.
  const [countryQuery, setCountryQuery] = useState("");

  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const countries =
    service && countryData?.serviceSlug === service.slug ? countryData.list : [];
  const countriesLoading = Boolean(
    service && countryData?.serviceSlug !== service.slug,
  );

  const trimmedCountryQuery = countryQuery.trim().toLowerCase();
  const visibleCountries = trimmedCountryQuery
    ? countries.filter(
        (item) =>
          item.name.toLowerCase().includes(trimmedCountryQuery) ||
          item.dialCode.toLowerCase().includes(trimmedCountryQuery),
      )
    : countries;

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

  // A real timer debounce plus an AbortController: typing fast used to fire
  // one request per keystroke and let every one of them run to completion
  // server side, only discarding the stale *responses*. This actually
  // cancels the in-flight request itself, not just its effect.
  const serviceDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serviceAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (serviceDebounce.current) clearTimeout(serviceDebounce.current);
      serviceAbort.current?.abort();
    };
  }, []);

  const searchServices = useCallback((query: string) => {
    if (serviceDebounce.current) clearTimeout(serviceDebounce.current);
    setServicesLoading(true);

    serviceDebounce.current = setTimeout(() => {
      serviceAbort.current?.abort();
      const controller = new AbortController();
      serviceAbort.current = controller;
      const token = ++serviceRequest.current;

      fetch(`/api/inventory/services?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { services?: ServiceOption[] }) => {
          if (token !== serviceRequest.current) return;
          setServices(data.services ?? []);
          setServicesError(false);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (token !== serviceRequest.current) return;
          // A failed request is not the same as "no matches": showing the
          // same empty-results copy for both would hide a real problem
          // behind what looks like an ordinary no-results state.
          setServices([]);
          setServicesError(true);
        })
        .finally(() => {
          if (token === serviceRequest.current) setServicesLoading(false);
        });
    }, 250);
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
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { countries?: CountryOption[] }) => {
        if (token !== countryRequest.current) return;
        setCountryData({ serviceSlug: slug, list: data.countries ?? [] });
        setCountriesErrorFor(null);
      })
      .catch(() => {
        if (token !== countryRequest.current) return;
        // A failed request is not the same as "this service has no
        // countries in stock": conflating them would hide a real problem
        // behind what looks like an ordinary out-of-stock state.
        setCountryData({ serviceSlug: slug, list: [] });
        setCountriesErrorFor(slug);
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
      router.push(`/login?callbackUrl=${encodeURIComponent(`${basePath}?service=${service.slug}`)}`);
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
        router.push(`${basePath}?activation=${result.activationId}`);
        router.refresh();
      }
    });
  }

  // The server returns popular services first, so grouping is a matter of
  // labelling the run rather than reordering anything here.
  const serviceOptions: ComboboxOption[] = services.map((item) => ({
    value: item.slug,
    label: item.name,
    hint: item.category,
    group: item.popular ? "Popular services" : "All services",
    leading: (
      <ServiceLogo
        slug={item.slug}
        name={item.name}
        color={item.color}
        size="sm"
      />
    ),
  }));

  const countryOptions: ComboboxOption[] = visibleCountries.map((item) => ({
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

  const unavailable = Boolean(unavailableMessage);
  const affordable = priceKobo !== undefined && walletBalanceKobo >= priceKobo;
  const canBuy = !unavailable && priceKobo !== undefined && (!signedIn || affordable);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Buy a number
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Search any service, pick a country, and see the exact price before you
        buy.
      </p>

      {unavailableMessage ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-warning-soft px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-warning">
              Number service temporarily unavailable
            </p>
            <p className="mt-0.5 text-sm text-warning">
              {unavailableMessage} Nothing can be purchased until it is, and
              your wallet balance is untouched.
            </p>
          </div>
        </div>
      ) : null}

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
              href={walletHref}
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
            <Button href={`/login?callbackUrl=${encodeURIComponent(basePath)}`} size="sm" variant="outline">
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
          emptyMessage={
            servicesError
              ? "Unable to load services. Please try again."
              : "No service matches that search."
          }
          options={serviceOptions}
          value={selectedServiceOption}
          loading={servicesLoading}
          disabled={unavailable}
          disabledMessage="No numbers on sale right now"
          autoFocus={!initialServiceSlug && !unavailable}
          onQueryChange={searchServices}
          onChange={(option) => {
            // Re-picking the service already selected must not throw away
            // the country the customer already chose for it.
            if (option.value === service?.slug) {
              setError(null);
              return;
            }
            const next = services.find((s) => s.slug === option.value);
            if (next) {
              setService(next);
              setCountry(null);
              setCountryQuery("");
              setError(null);
            }
          }}
        />

        <Combobox
          // Remounts on service change, so its own internal typed-text
          // state can't linger from a previous service's country search.
          key={service?.slug ?? "none"}
          label="Country"
          placeholder="Search countries"
          emptyMessage={
            countriesLoading
              ? "Checking availability..."
              : countriesError
                ? "Unable to load countries. Please try again."
                : trimmedCountryQuery && countries.length > 0
                  ? "No country matches that search."
                  : "No country has stock for this service right now."
          }
          options={countryOptions}
          value={selectedCountryOption}
          loading={countriesLoading}
          disabled={!service || unavailable}
          disabledMessage={
            unavailable ? "No numbers on sale right now" : "Choose a service first"
          }
          onQueryChange={setCountryQuery}
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
          <Button href={walletHref} size="sm" variant="outline">
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
