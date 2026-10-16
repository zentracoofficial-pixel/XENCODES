"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BarChart3, Loader2, Sparkles, Star, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Combobox, type ComboboxOption } from "@/components/product/combobox";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { formatMoney } from "@/lib/currency";
import { useDisplayMoney } from "@/components/currency/currency-provider";
import { DisplayAmount } from "@/components/currency/display-amount";
import {
  purchaseNumberAction,
  type CustomerServer,
  type PurchaseError,
} from "@/app/dashboard/buy/actions";
import { toggleFavoriteServiceAction } from "@/app/dashboard/favorites-actions";
import { expandCountryQuery } from "@/lib/search-aliases";
import { CountryBrowser, type CountryServiceRow } from "@/components/product/country-browser";
import { Flag } from "@/components/ui/flag";

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
    "Unable to complete your request. Nothing was charged, so please try again.",
  price_changed:
    "The price changed while you were deciding. Check the new price and confirm again.",
  unverified_limit_reached:
    "You've reached the purchase limit for unverified accounts. Verify your email to keep buying numbers.",
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
  stock: "in_stock" | "low";
  /** 0-100: either the provider's own reported rate, or Xencodes' own
   *  measured completion rate for this pair from real order history — see
   *  InventoryCountry's own doc comment in src/lib/inventory.ts. */
  successRate?: number;
  /** Only set when successRate came from Xencodes' own history (never for
   *  a provider-reported rate, which this app has never actually seen);
   *  drives the low-quality warning below. */
  qualityTier?: "high" | "medium" | "low";
  /** How many completed Xencodes orders successRate is measured from. Set
   *  only alongside a Xencodes-measured rate. */
  sampleSize?: number;
  /** True for the one variant of a broad country (e.g. "USA" vs "USA (2)")
   *  Xencodes' own real delivery history and current stock say is the
   *  better pick — see src/lib/country-recommendation.ts. Guidance only:
   *  picking a different, currently-available variant still buys exactly
   *  that one. */
  recommended?: boolean;
  recommendationReason?: string;
  /** What to actually tell the customer about this option's chances: a
   *  real percentage when there is enough history to justify one, an
   *  honest availability-based fallback otherwise — never fabricated. */
  deliverabilityLabel: { text: string; hasPercent: boolean };
}

/**
 * A quote result carries the pair it was fetched for. Whether the UI is
 * "loading" is then derived by comparing that pair to the current
 * selection rather than tracked separately, so there is no window where
 * a price fetched for the previous country is displayed against the new
 * one.
 */
interface ServerOption {
  server: CustomerServer;
  priceKobo: number;
}

interface QuoteResult {
  serviceSlug: string;
  countrySlug: string;
  available: boolean;
  priceKobo?: number;
  /** What each server would charge for this pair, "I" before "II". */
  options?: ServerOption[];
  message?: string;
}

export function BuyPanel({
  initialServices,
  initialServiceSlug,
  initialCountrySlug,
  initialFavoriteSlugs = [],
  signedIn,
  walletBalanceKobo,
  currency,
  walletCurrency = currency,
  unavailableMessage,
  basePath = "/buy",
  walletHref = "/dashboard/wallet",
  showHeading = true,
}: {
  initialServices: ServiceOption[];
  initialServiceSlug?: string;
  /** Which services this signed-in customer has already favorited, so the
   *  star reflects real stored state (see FavoriteService) rather than
   *  guessing from local UI state alone. */
  initialFavoriteSlugs?: string[];
  /** Pre-selects a country once its list loads for initialServiceSlug — used
   *  by "Buy again" (see dashboard/history) to jump straight to the same
   *  service+country a past order used. Never pre-fills a price: the normal
   *  live quote fetch below still runs for this pair exactly as it would for
   *  a manual selection, so "buy again" can never charge or claim available
   *  a price/stock level that no longer holds. */
  initialCountrySlug?: string;
  signedIn: boolean;
  walletBalanceKobo: number;
  /** The currency the wallet is held in (the customer's own). Prices are
   *  quoted in `currency` and converted into this when bought. */
  walletCurrency?: string;
  /** The currency every price on this page is quoted and charged in: the
   *  signed-in customer's own currency, or the platform default when
   *  signed out. Never assumed to be Naira. */
  currency: string;
  /** Set when no number provider is connected. Every control is disabled
   *  and this is shown, so the page never looks ready to sell something
   *  there is no supplier behind. */
  unavailableMessage?: string;
  /** Where an activation is shown once bought. The dashboard keeps the
   *  customer inside its own shell, the public route does not. */
  basePath?: string;
  walletHref?: string;
  /** False when the page around the panel already carries the "Buy a
   *  number" h1 (the public /buy page header), so there is only ever one. */
  showHeading?: boolean;
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
  const [errorCode, setErrorCode] = useState<PurchaseError | null>(null);
  const [favoriteSlugs, setFavoriteSlugs] = useState<Set<string>>(
    () => new Set(initialFavoriteSlugs),
  );

  function toggleFavorite(slug: string, name: string) {
    // Optimistic: this is a starred/unstarred preference, not money moving,
    // so there is nothing to lose by reflecting the click immediately and
    // reverting quietly if the write turns out to have failed.
    const wasFavorited = favoriteSlugs.has(slug);
    setFavoriteSlugs((prev) => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(slug);
      else next.add(slug);
      return next;
    });
    void toggleFavoriteServiceAction(slug, name).then((result) => {
      if (!result) {
        setFavoriteSlugs((prev) => {
          const reverted = new Set(prev);
          if (wasFavorited) reverted.add(slug);
          else reverted.delete(slug);
          return reverted;
        });
      }
    });
  }

  // One stable key per service+country selection, not one per click: a
  // retried request or a double-click for the *same* selection must reuse
  // it (that's what lets the server recognize a duplicate), but choosing a
  // different pair — or buying again after a completed purchase — is a
  // genuinely new attempt and needs a fresh one. See purchaseNumberAction's
  // own comment for what this actually protects against.
  const idempotencyRef = useRef<{ pair: string; key: string } | null>(null);
  function idempotencyKeyFor(pair: string): string {
    if (idempotencyRef.current?.pair !== pair) {
      idempotencyRef.current = {
        pair,
        key:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${pair}:${Date.now()}:${Math.random()}`,
      };
    }
    return idempotencyRef.current.key;
  }

  const countries =
    service && countryData?.serviceSlug === service.slug ? countryData.list : [];
  const countriesLoading = Boolean(
    service && countryData?.serviceSlug !== service.slug,
  );

  const trimmedCountryQuery = countryQuery.trim().toLowerCase();
  // A common abbreviation ("us", "uk", "uae"...) is searched for alongside
  // the literal text typed — see src/lib/search-aliases.ts.
  const countryQueryTerms = expandCountryQuery(trimmedCountryQuery);
  const visibleCountries = trimmedCountryQuery
    ? countries.filter((item) => {
        const name = item.name.toLowerCase();
        return countryQueryTerms.some(
          (term) => name.includes(term) || item.dialCode.toLowerCase().includes(term),
        );
      })
    : countries;

  const quoteFresh =
    service &&
    country &&
    quoteResult?.serviceSlug === service.slug &&
    quoteResult?.countrySlug === country.slug
      ? quoteResult
      : null;
  const quoteLoading = Boolean(service && country && !quoteFresh);
  // The servers that can sell this pair and the one chosen. Nothing chosen
  // yet means the cheapest, so the price shown is always one a server is
  // actually offering.
  const serverOptions = quoteFresh?.available ? (quoteFresh.options ?? []) : [];
  const [chosenServer, setChosenServer] = useState<{ pair: string; server: CustomerServer } | null>(null);
  const pairKey = service && country ? `${service.slug}:${country.slug}` : "";
  const cheapestOption = serverOptions.reduce<ServerOption | undefined>(
    (best, option) => (!best || option.priceKobo < best.priceKobo ? option : best),
    undefined,
  );
  const selectedOption =
    serverOptions.find((option) => chosenServer?.pair === pairKey && option.server === chosenServer.server) ??
    cheapestOption;
  const priceKobo = quoteFresh?.available ? (selectedOption?.priceKobo ?? quoteFresh.priceKobo) : undefined;

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

    fetch(
      `/api/inventory/countries?service=${encodeURIComponent(slug)}&currency=${encodeURIComponent(currency)}`,
    )
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
  }, [service, currency]);

  // Consumed at most once per service: a "buy again" deep link pre-selects
  // the country the moment its list arrives for the matching service, but
  // must never fight a customer who has since picked a different one
  // themselves. Adjusted directly during render (React's own documented
  // pattern for "run something once when a dependency changes") rather than
  // in an effect, since it only ever reacts to countryData/service that are
  // already being rendered from — there is nothing external to subscribe to.
  const [countryAutoSelectDoneFor, setCountryAutoSelectDoneFor] = useState<string | null>(null);
  // The country to pre-select: from a "buy again" link, or the country a
  // customer browsing by country picked a service in.
  const [preselectCountrySlug, setPreselectCountrySlug] = useState<string | undefined>(initialCountrySlug);
  const [preselectMissed, setPreselectMissed] = useState<string | null>(null);
  if (
    preselectCountrySlug &&
    service &&
    countryData?.serviceSlug === service.slug &&
    countryAutoSelectDoneFor !== service.slug
  ) {
    setCountryAutoSelectDoneFor(service.slug);
    const match = countryData.list.find((item) => item.slug === preselectCountrySlug);
    if (match) setCountry(match);
    else setPreselectMissed(service.slug);
  }

  // "By service" is the original flow and the default; "By country" lists a
  // country's services with prices and hands the pick back to it.
  const [mode, setMode] = useState<"service" | "country">("service");
  function pickFromCountry(row: CountryServiceRow, picked: { slug: string }) {
    setService({ slug: row.slug, name: row.name, color: row.color, category: row.category, popular: row.popular });
    setCountry(null);
    setCountryQuery("");
    setError(null);
    setPreselectCountrySlug(picked.slug);
    setCountryAutoSelectDoneFor(null);
    setPreselectMissed(null);
    setMode("service");
  }

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
      `/api/inventory/quote?service=${encodeURIComponent(pair.serviceSlug)}&country=${encodeURIComponent(pair.countrySlug)}&currency=${encodeURIComponent(currency)}`,
    )
      .then((res) => res.json())
      .then((data: { available?: boolean; priceKobo?: number; options?: ServerOption[]; message?: string }) => {
        if (token !== quoteRequest.current) return;
        setQuoteResult(
          data.available && typeof data.priceKobo === "number"
            ? { ...pair, available: true, priceKobo: data.priceKobo, options: data.options ?? [] }
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
  }, [service, country, currency]);

  function buy() {
    if (!service || !country || priceKobo === undefined) return;

    if (!signedIn) {
      router.push(`/login?callbackUrl=${encodeURIComponent(`${basePath}?service=${service.slug}`)}`);
      return;
    }

    setError(null);
    setErrorCode(null);
    // The server the customer chose (when the quote offered servers), so the
    // price they confirmed is the one that server charges.
    const server = selectedOption?.server;
    const idempotencyKey = idempotencyKeyFor(`${service.slug}:${country.slug}:${server ?? "any"}`);
    startTransition(async () => {
      const result = await purchaseNumberAction(
        service.slug,
        country.slug,
        priceKobo,
        idempotencyKey,
        server,
      );

      if (result.error) {
        setError(
          result.error === "unavailable" && server && serverOptions.length > 1
            ? `Server ${server} has no numbers for this right now. Try the other server or another country.`
            : errorCopy[result.error],
        );
        setErrorCode(result.error);
        // A price that moved is not a dead end: show the new one so the
        // customer can decide against the current figure.
        if (result.error === "price_changed" && result.priceKobo !== undefined) {
          const newPrice = result.priceKobo;
          setQuoteResult({
            serviceSlug: service.slug,
            countrySlug: country.slug,
            available: true,
            priceKobo: newPrice,
            options: serverOptions.map((option) =>
              option.server === server ? { ...option, priceKobo: newPrice } : option,
            ),
          });
        }
        return;
      }

      if (result.activationId) {
        // A completed purchase, however it was reached, closes this
        // attempt — the next click on "buy" (a different number, or the
        // same pair again) is a new one and earns a fresh key.
        idempotencyRef.current = null;
        router.push(`${basePath}?activation=${result.activationId}`);
        router.refresh();
      }
    });
  }

  // Re-picking the service already selected must not throw away the
  // country the customer already chose for it.
  function chooseService(slug: string) {
    if (slug === service?.slug) {
      setError(null);
      return;
    }
    const next = services.find((s) => s.slug === slug);
    if (next) {
      setPreselectMissed(null);
      setService(next);
      setCountry(null);
      setCountryQuery("");
      setError(null);
    }
  }

  const popularServices = services.filter((item) => item.popular).slice(0, 12);

  // The server returns popular services first, so grouping is a matter of
  // labelling the run rather than reordering anything here.
  // Every price, the balance and the shortfall are shown in the customer's
  // chosen currency, all converted at the same rate so they agree.
  const displayMoney = useDisplayMoney();
  const priceText = (kobo: number) =>
    displayMoney ? displayMoney.format(kobo, currency) : formatMoney(kobo, currency);

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
    // Just the country and its dialling code, in A-Z order. No price and
    // no tag here: the price is shown per server once a country is chosen.
    hint: item.dialCode,
    leading: (
      <Flag flag={item.flag} />
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
          <Flag flag={country.flag} />
        ),
      }
    : null;

  const unavailable = Boolean(unavailableMessage);
  // The price as it would leave the wallet: converted once, at the same rate
  // the price is shown at.
  const priceInWallet =
    priceKobo === undefined
      ? undefined
      : walletCurrency === currency
        ? priceKobo
        : (displayMoney?.convert(priceKobo, currency, walletCurrency) ?? undefined);
  const affordable = priceInWallet !== undefined && walletBalanceKobo >= priceInWallet;
  const canBuy = !unavailable && priceKobo !== undefined && (!signedIn || affordable);

  return (
    <div className="mx-auto max-w-lg">
      {showHeading ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Buy a number
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Search a service or browse a country, and see the exact price before
            you buy.
          </p>
        </>
      ) : null}

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
              <DisplayAmount kobo={walletBalanceKobo} currency={walletCurrency} />
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

      <div
        role="tablist"
        aria-label="How to choose"
        className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1"
      >
        {(
          [
            ["service", "By service"],
            ["country", "By country"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-10 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40",
              mode === value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "country" ? (
        <div className="mt-4">
          <CountryBrowser
            currency={currency}
            disabled={unavailable}
            priceText={priceText}
            onPick={pickFromCountry}
          />
        </div>
      ) : null}

      <div className={cn("mt-4 space-y-4", mode === "country" && "hidden")}>
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
          onQueryChange={searchServices}
          onChange={(option) => chooseService(option.value)}
        />

        {/* The popular services sit in plain view instead of inside the
            search list, so the page opens without focusing the search box
            (which would pop the keyboard up on a phone) and a customer can
            still pick one with a single tap. */}
        {!service && !unavailable && popularServices.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Popular services</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {popularServices.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => chooseService(item.slug)}
                  className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm font-medium transition-colors hover:border-mint hover:bg-mint-soft"
                >
                  <ServiceLogo slug={item.slug} name={item.name} color={item.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {service && signedIn ? (
          <button
            type="button"
            onClick={() => toggleFavorite(service.slug, service.name)}
            className="-mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-forest"
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                favoriteSlugs.has(service.slug) && "fill-mint text-mint",
              )}
            />
            {favoriteSlugs.has(service.slug) ? "Favorited" : "Add to favorites"}
          </button>
        ) : null}

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

      {mode === "service" && service && preselectMissed === service.slug && !country && !countriesError ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {service.name} has no numbers in that country right now. Pick another country above.
        </p>
      ) : null}

      {/* Availability and price, only once there is a real pair to price. */}
      {mode === "service" && service && country ? (
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
            <>
            {serverOptions.length > 0 ? (
              <fieldset className="mb-4">
                <legend className="text-xs font-medium text-muted-foreground">
                  {serverOptions.length > 1 ? "Choose a server" : "Server"}
                </legend>
                <div className={cn("mt-2 grid gap-2", serverOptions.length > 1 && "sm:grid-cols-2")}>
                  {serverOptions.map((option) => {
                    const selected = selectedOption?.server === option.server;
                    const lowest = serverOptions.length > 1 && option.priceKobo === cheapestOption?.priceKobo;
                    return (
                      <label
                        key={option.server}
                        className={cn(
                          "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-mint/40",
                          selected ? "border-forest bg-mint-soft" : "border-border bg-surface hover:border-mint",
                        )}
                      >
                        <input
                          type="radio"
                          name="server"
                          value={option.server}
                          checked={selected}
                          onChange={() => setChosenServer({ pair: pairKey, server: option.server })}
                          className="h-4 w-4 shrink-0 accent-[var(--forest)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">Server {option.server}</span>
                          {lowest ? (
                            <span className="block text-[11px] font-medium text-forest">Lowest price</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{priceText(option.priceKobo)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">You pay</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {priceText(priceKobo)}
                </p>
              </div>
              <div className="pb-1 text-right">
                {country.recommended ? (
                  <p className="flex items-center justify-end gap-1 text-xs font-semibold text-forest">
                    <Sparkles className="h-3.5 w-3.5" />
                    Recommended
                  </p>
                ) : null}
              </div>
            </div>
            </>
          ) : null}

          {country.recommended && country.recommendationReason ? (
            <p className="mt-2 text-xs text-muted-foreground">{country.recommendationReason}</p>
          ) : null}

          {/* A delivery rate only when Xencodes has measured one itself, from
              enough of its own completed orders (see MIN_SAMPLE_SIZE in
              src/lib/deliverability.ts), and always said so: the supplier
              reports no delivery figure of its own, so there is nothing
              else to show and nothing is estimated. */}
          {country.successRate !== undefined && country.qualityTier && country.sampleSize ? (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest" aria-hidden />
              <span>
                <span className="font-medium text-foreground">{country.successRate}% received a code</span>{" "}
                across {country.sampleSize} recent completed Xencodes orders for {service.name} in{" "}
                {country.name}.
              </span>
            </p>
          ) : null}

          {/* No percentage shown: see the countryOptions hint above for why.
              The qualitative caution stays, since it is a genuine,
              sufficiently-sampled Xencodes finding worth a customer knowing
              before they buy — the object was to the number, not the
              warning. */}
          {country.qualityTier === "low" ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="text-sm text-danger">
                This country has had a low delivery rate on recent Xencodes
                orders. You can still buy it, but consider another country
                if one is available.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "service" && signedIn && priceInWallet !== undefined && !affordable ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3">
          <p className="text-sm text-warning">
            Add{" "}
            {displayMoney
              ? displayMoney.format(priceInWallet - walletBalanceKobo, walletCurrency)
              : formatMoney(priceInWallet - walletBalanceKobo, walletCurrency)}{" "}
            to your wallet to buy this number.
          </p>
          <Button href={walletHref} size="sm" variant="outline">
            Add funds
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-soft px-3.5 py-2.5">
          <p className="text-sm text-danger">{error}</p>
          {errorCode === "unverified_limit_reached" ? (
            <Button href="/verify-email" size="sm" variant="outline">
              Verify email
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button
        onClick={buy}
        disabled={!canBuy || pending}
        size="lg"
        className={cn("mt-5 w-full", mode === "country" && "hidden")}
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
