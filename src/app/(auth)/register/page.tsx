import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { requestCountry, currencyForCountry, getCurrencyConfig } from "@/lib/currency-config";

export const metadata: Metadata = {
  title: "Create account",
};

// Reads the request's own edge-detected location on every request: a
// pre-rendered page cached at build time could not know a real visitor's
// country.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // A suggestion only, not an assignment: geo-IP is wrong often enough
  // (VPNs, corporate proxies, travel) that the form still lets someone
  // pick the other option themselves. What is never offered is anything
  // beyond these two: Nigeria gets NGN, everywhere else gets USD.
  const country = await requestCountry();
  const suggested = currencyForCountry(country);
  const usdFundingAvailable = (await getCurrencyConfig("USD"))?.fundingAvailable ?? false;

  return (
    <RegisterForm suggestedCurrency={suggested} usdFundingAvailable={usdFundingAvailable} />
  );
}
