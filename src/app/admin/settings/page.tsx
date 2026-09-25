import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Mail, Percent, Plug, ShieldCheck, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin, bootstrapAdminEmails } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { readSettings, readNumber, SETTING_KEYS, DEFAULT_TOPUP_FEE_PERCENT } from "@/lib/settings";
import { loadMarginRules } from "@/lib/pricing";
import { getEnabledProviders, getNumberProvider } from "@/lib/provider";
import { formatMoney } from "@/lib/currency";
import { getEnabledCurrencies } from "@/lib/currency-config";
import { FUNDING_PROVIDER } from "@/lib/funding-limits";
import { isKorapayConfigured } from "@/lib/korapay";
import { isEmailConfigured, emailFromAddress } from "@/lib/email";
import { SUPPORT_EMAIL } from "@/lib/site";
import { MarginForm, TopupFeeForm, TestEmailButton } from "./settings-forms";

export const metadata: Metadata = { title: "Admin: Settings" };

export const dynamic = "force-dynamic";

/**
 * Business configuration, a summary of the provider connections, and who
 * has admin access. Everything else an admin changes belongs to a record,
 * and lives on that record's own page: per-provider connection detail on
 * Providers, per-service pricing overrides on Services.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdmin();

  const [settings, rules, admins, resolved, enabledProviders, enabledCurrencies] =
    await Promise.all([
      readSettings(),
      loadMarginRules(),
      prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
      getNumberProvider(),
      getEnabledProviders(),
      getEnabledCurrencies(),
    ]);

  const pendingBootstrap = bootstrapAdminEmails().filter(
    (email) => !admins.some((a) => a.email.toLowerCase() === email),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pricing defaults, the provider connections, and admin access.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Percent className="h-4 w-4" />
          Pricing
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The margins every price falls back to. Per-service overrides are set
          on{" "}
          <Link href="/admin/services" className="text-forest hover:underline">
            Services
          </Link>
          .
        </p>
        <div className="mt-4">
          <MarginForm
            defaultPercent={rules.defaultPercent}
            exclusivePercent={rules.exclusivePercent}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Plug className="h-4 w-4" />
          Number providers
          <Badge variant={resolved.connected ? "success" : "warning"}>
            {resolved.connected ? "Connected" : "Disconnected"}
          </Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Where Xencodes buys numbers from. Nothing can be sold until at
          least one is connected and enabled.{" "}
          {enabledProviders.length > 0
            ? `Currently buying from ${enabledProviders.map((p) => p.label).join(", ")}.`
            : "None enabled right now."}{" "}
          Enabling, disabling, priority, connection testing and catalog sync
          for every provider live on{" "}
          <Link href="/admin/providers" className="text-forest hover:underline">
            Providers
          </Link>
          . Every provider bills Xencodes in US dollars; the exchange rate
          used to convert that into each currency customers actually pay in
          is set per currency on{" "}
          <Link href="/admin/currencies" className="text-forest hover:underline">
            Currencies
          </Link>
          , not here.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4" />
          Payment provider
          <Badge variant={isKorapayConfigured() ? "success" : "warning"}>
            {isKorapayConfigured() ? "Connected" : "Not connected"}
          </Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {isKorapayConfigured()
            ? `${FUNDING_PROVIDER.label} is connected: a top up opens a real checkout page, and the wallet is credited only after this server verifies the payment directly with ${FUNDING_PROVIDER.label}, from its own webhook and from the customer's return to the wallet page. Neither ever trusts the other alone.`
            : `${FUNDING_PROVIDER.label} is the provider for customer funding, but KORAPAY_SECRET_KEY is not set on this deployment. Customers can create a funding request, and it stays pending, because a balance only moves once a payment has been verified with the provider on the server.`}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          No credentials are stored here; they belong only in this
          deployment&apos;s environment variables. Pending requests are
          visible on{" "}
          <Link href="/admin/wallet?status=PENDING" className="text-forest hover:underline">
            Wallet
          </Link>
          .
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="h-4 w-4" />
          Email
          <Badge variant={isEmailConfigured() ? "success" : "warning"}>
            {isEmailConfigured() ? "Connected" : "Not connected"}
          </Badge>
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {isEmailConfigured()
            ? "Resend is connected. Every outbound email — verification links, password resets, admin campaigns, support notifications — sends through it."
            : "RESEND_API_KEY is not set on this deployment. Nothing is actually sent; every send attempt fails and is logged server-side."}
        </p>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Currently sending as
            </dt>
            <dd className="mt-1 break-all text-sm font-medium">{emailFromAddress()}</dd>
          </div>
          <div className="rounded-lg border border-border px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Support notifications go to
            </dt>
            <dd className="mt-1 break-all text-sm font-medium">{SUPPORT_EMAIL}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          If &quot;currently sending as&quot; still shows{" "}
          <code className="rounded bg-background px-1 py-0.5">onboarding@resend.dev</code>,
          the <code className="rounded bg-background px-1 py-0.5">EMAIL_FROM</code> environment
          variable is not live on this exact deployment yet — check it is set for Production
          and that a deploy has actually run since. Resend also restricts that sandbox
          address to only deliver to your own Resend account email.
        </p>
        <div className="mt-4 border-t border-border pt-4">
          <TestEmailButton />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" />
          Wallet
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Exactly two: NGN for accounts in Nigeria, USD for everyone else.
          Never a currency per country. Exchange rates, top-up bounds and
          each one&apos;s actual funding status live on{" "}
          <Link href="/admin/currencies" className="text-forest hover:underline">
            Currencies
          </Link>
          .
        </p>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {enabledCurrencies.map((currency) => (
            <div key={currency.code} className="rounded-lg border border-border px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                {currency.code}
                <Badge variant={currency.fundingAvailable ? "success" : "warning"}>
                  {currency.fundingAvailable ? "Funding live" : "Funding not connected"}
                </Badge>
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {formatMoney(currency.minTopUpMinor, currency.code)} to{" "}
                {formatMoney(currency.maxTopUpMinor, currency.code)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Customers enter their own amount inside their currency&apos;s bounds.
          There are no fixed funding packages.
        </p>
        <div className="mt-5 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">Processing fee</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            KoraPay&apos;s hosted checkout has no API option to bill its own
            fee to the customer directly (that field exists only on
            KoraPay&apos;s separate direct charge APIs, and using it here
            broke checkout in a real test), so this fee is added to the
            amount requested at checkout instead, matching KoraPay&apos;s
            own published rate by default below. The cap on this fee is set
            per currency on{" "}
            <Link href="/admin/currencies" className="text-forest hover:underline">
              Currencies
            </Link>
            .
          </p>
          <div className="mt-3">
            <TopupFeeForm
              feePercent={readNumber(
                settings,
                SETTING_KEYS.topupFeePercent,
                DEFAULT_TOPUP_FEE_PERCENT,
              )}
            />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Admins
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {admins.length} {admins.length === 1 ? "admin has" : "admins have"}{" "}
            access to this panel. Manage individual accounts from Users.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {admins.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
            >
              <Link
                href={`/admin/users/${user.id}`}
                className="-my-2 block truncate py-2 text-sm font-medium hover:text-forest hover:underline"
              >
                {user.email}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {user.id === admin.id ? <Badge variant="default">You</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  Since{" "}
                  {user.createdAt.toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {pendingBootstrap.length > 0 ? (
          <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Also configured to auto-promote on next sign-in:{" "}
            {pendingBootstrap.join(", ")} (via the{" "}
            <code className="rounded bg-background px-1 py-0.5">ADMIN_EMAILS</code>{" "}
            environment variable).
          </p>
        ) : null}
      </Card>
    </div>
  );
}
