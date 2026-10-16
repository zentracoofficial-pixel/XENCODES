"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, RotateCw, Search } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/product/combobox";
import { ServiceLogo } from "@/components/marketing/service-logo";
import { expandCountryQuery, expandServiceQuery } from "@/lib/search-aliases";

/**
 * Buying by country first: pick a country, see every service on sale there
 * with its price, tap one. The tap hands the pair to the normal buy flow,
 * which quotes the exact price live before anything is charged; the prices
 * here are the lowest current ones ("from"), read from the synced catalog.
 */

interface CountryRow {
  slug: string;
  name: string;
  flag: string;
  dialCode: string;
  serviceCount: number;
}

export interface CountryServiceRow {
  slug: string;
  name: string;
  color: string;
  category: string;
  popular: boolean;
  fromPriceKobo: number;
}

type Load<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

export function CountryBrowser({
  currency,
  disabled,
  priceText,
  initialCountrySlug,
  onPick,
}: {
  currency: string;
  disabled: boolean;
  priceText: (kobo: number) => string;
  initialCountrySlug?: string;
  onPick: (service: CountryServiceRow, country: { slug: string }) => void;
}) {
  const [countries, setCountries] = useState<Load<CountryRow[]>>({ state: "loading" });
  const [countryQuery, setCountryQuery] = useState("");
  const [countrySlug, setCountrySlug] = useState<string | null>(initialCountrySlug ?? null);
  const [services, setServices] = useState<Load<CountryServiceRow[]> | null>(null);
  const [serviceQuery, setServiceQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Each country's services are fetched once per visit: switching back and
  // forth between countries does not ask the server again.
  const cache = useRef(new Map<string, CountryServiceRow[]>());
  const request = useRef(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/inventory/by-country?currency=${encodeURIComponent(currency)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ countries?: CountryRow[] }>;
      })
      .then((data) => live && setCountries({ state: "ready", data: data.countries ?? [] }))
      .catch(() => live && setCountries({ state: "error" }));
    return () => {
      live = false;
    };
  }, [currency, attempt]);

  useEffect(() => {
    if (!countrySlug) return;
    const cached = cache.current.get(`${currency}:${countrySlug}`);
    if (cached) {
      setServices({ state: "ready", data: cached });
      return;
    }
    const token = ++request.current;
    setServices({ state: "loading" });
    fetch(`/api/inventory/by-country?country=${encodeURIComponent(countrySlug)}&currency=${encodeURIComponent(currency)}`)
      .then(async (res) => {
        if (res.status === 404) return [] as CountryServiceRow[];
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { services?: CountryServiceRow[] }).services ?? [];
      })
      .then((list) => {
        if (token !== request.current) return;
        cache.current.set(`${currency}:${countrySlug}`, list);
        setServices({ state: "ready", data: list });
      })
      .catch(() => {
        if (token === request.current) setServices({ state: "error" });
      });
  }, [countrySlug, currency, attempt]);

  const countryList = countries.state === "ready" ? countries.data : [];
  const country = countryList.find((row) => row.slug === countrySlug) ?? null;
  const terms = expandCountryQuery(countryQuery.trim().toLowerCase());
  const countryOptions: ComboboxOption[] = countryList
    .filter((row) =>
      terms.length === 0 || terms[0] === ""
        ? true
        : terms.some((term) => row.name.toLowerCase().includes(term) || row.dialCode.includes(term)),
    )
    .map((row) => ({
      value: row.slug,
      label: row.name,
      hint: `${row.dialCode} · ${row.serviceCount} service${row.serviceCount === 1 ? "" : "s"}`,
      leading: (
        <span aria-hidden className="text-lg leading-none">
          {row.flag}
        </span>
      ),
    }));

  const visibleServices = useMemo(() => {
    if (services?.state !== "ready") return [];
    const query = serviceQuery.trim().toLowerCase();
    if (!query) return services.data;
    const serviceTerms = expandServiceQuery(query);
    return services.data.filter((row) => {
      const name = row.name.toLowerCase();
      return serviceTerms.some((term) => name.includes(term) || row.slug.includes(term));
    });
  }, [services, serviceQuery]);

  return (
    <div className="space-y-4">
      {countries.state === "error" ? (
        <ErrorRow text="Countries could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <Combobox
          label="Country"
          placeholder="Search countries, for example Canada"
          emptyMessage={countries.state === "loading" ? "Loading countries..." : "No country matches that search."}
          options={countryOptions}
          value={
            country
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
              : null
          }
          loading={countries.state === "loading"}
          disabled={disabled}
          disabledMessage="No numbers on sale right now"
          onQueryChange={setCountryQuery}
          onChange={(option) => {
            setCountrySlug(option.value);
            setServiceQuery("");
          }}
        />
      )}

      {countrySlug ? (
        <section aria-label={country ? `Services in ${country.name}` : "Services"}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {services?.state === "ready"
                ? `${services.data.length} service${services.data.length === 1 ? "" : "s"} available`
                : "Services"}
            </p>
            <p className="text-xs text-muted-foreground">Exact price shown before you buy</p>
          </div>

          {services?.state === "ready" && services.data.length > 8 ? (
            <label className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-mint focus-within:ring-2 focus-within:ring-mint/25">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">Search services in this country</span>
              <input
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Search services"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          ) : null}

          {services?.state === "loading" ? (
            <ul className="mt-2 space-y-2" aria-hidden>
              {Array.from({ length: 5 }).map((_, index) => (
                <li key={index} className="h-14 animate-pulse rounded-xl border border-border bg-background" />
              ))}
            </ul>
          ) : services?.state === "error" ? (
            <div className="mt-2">
              <ErrorRow text="Prices could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />
            </div>
          ) : services?.state === "ready" && services.data.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              Nothing is on sale in this country right now. Try another country.
            </p>
          ) : services?.state === "ready" ? (
            <>
              <ul className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                {visibleServices.slice(0, 200).map((row) => (
                  <li key={row.slug}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(row, { slug: countrySlug })}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-mint hover:bg-mint-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint/40 disabled:opacity-50"
                    >
                      <ServiceLogo slug={row.slug} name={row.name} color={row.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{row.category}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[11px] text-muted-foreground">from</span>
                        <span className="block text-sm font-semibold tabular-nums">{priceText(row.fromPriceKobo)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {visibleServices.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No service matches that search.</p>
              ) : visibleServices.length > 200 ? (
                <p className="mt-2 text-xs text-muted-foreground">Showing 200 of {visibleServices.length}. Search to narrow it down.</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : countries.state === "ready" && countryList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          No country has numbers on sale right now. Please check back soon.
        </p>
      ) : null}
    </div>
  );
}

function ErrorRow({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {text}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-mint"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}
