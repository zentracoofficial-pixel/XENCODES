import type { Metadata } from "next";
import { RegisterForm } from "./register-form";
import { getEnabledCurrencies } from "@/lib/currency-config";
import { currencyDisplayName } from "@/lib/currency";

export const metadata: Metadata = {
  title: "Create account",
};

// Reads the admin-configured currency list on every request: enabling a
// new currency must show up immediately, not only after the next deploy,
// the way a statically prerendered page would freeze it.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const enabled = await getEnabledCurrencies();
  const currencies = enabled.map((c) => ({
    code: c.code,
    label: c.countryLabel ? `${c.code} — ${c.countryLabel}` : `${c.code} — ${currencyDisplayName(c.code)}`,
  }));

  return <RegisterForm currencies={currencies} />;
}
