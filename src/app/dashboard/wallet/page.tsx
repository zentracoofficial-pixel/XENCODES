import type { Metadata } from "next";
import { DisplayAmount } from "@/components/currency/display-amount";
import { Suspense } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Sparkles,
  Wallet as WalletIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCurrencyConfig, getDefaultCurrency, readCurrencyConfig } from "@/lib/currency-config";
import { isCryptomusConfigured } from "@/lib/cryptomus";
import { getFundingOptions } from "@/lib/funding-config";
import { getDisplayContext } from "@/lib/display-preference";
import { FundWallet, type LocalOption } from "./fund-wallet";
import {
  FUNDING_CURRENCIES,
  formatFundingAmount,
  isFundingCurrencyCode,
} from "@/lib/funding-currencies";
import { reconcileStalePendingTopUpsAction } from "./actions";
import { CURRENCY_MOVE_PROVIDER } from "@/lib/wallet-currency";
import { Pagination } from "@/components/ui/pagination";
import { pageMath, parsePage } from "@/lib/pagination";

export const metadata: Metadata = { title: "Wallet" };

const typeMeta = {
  TOPUP: { label: "Top-up", icon: ArrowDownLeft },
  PURCHASE: { label: "Number purchase", icon: ArrowUpRight },
  REFUND: { label: "Refund", icon: RotateCcw },
  ADJUSTMENT: { label: "Account adjustment", icon: Sparkles },
} as const;

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

/** Transactions per page. */
const PAGE_SIZE = 15;

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  const userId = session!.user.id;

  // A bank-transfer top up can settle after the customer already left
  // KoraPay's checkout page, so a webhook is the only other thing that
  // would otherwise ever notice. This gives every wallet-page load a
  // second chance, backed off per transaction (see reconcileTopUp() in
  // src/lib/funding.ts) so it never turns a page view into a KoraPay call
  // every time.
  await reconcileStalePendingTopUpsAction();
  // Before the balance is read, so the wallet is already in the customer's
  // chosen currency.
  const displayContext = await getDisplayContext();

  const historyWhere = {
    userId,
    status: { in: ["SUCCESSFUL", "FAILED"] as Array<"SUCCESSFUL" | "FAILED"> },
    // Spelled out: provider is usually null, and NOT (provider = x AND ...)
    // would drop those rows too.
    OR: [{ provider: null }, { provider: { not: CURRENCY_MOVE_PROVIDER } }, { amountKobo: { gte: 0 } }],
  };

  const [user, total] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    // A top-up the customer never actually completed (abandoned, or the
    // checkout link expired without a payment attempt) is recorded as
    // PENDING or CANCELLED, but was never money asked for and received or
    // genuinely attempted, so it has no place in the customer's own
    // history. Only a completed payment or a real declined attempt shows.
    // The outgoing half of a balance moving to another currency is left out:
    // the customer sees their balance arriving in its new currency.
    prisma.walletTransaction.count({ where: historyWhere }),
  ]);
  // One page at a time, newest first, so the list never grows without end.
  const paging = pageMath(total, parsePage((await searchParams).page), PAGE_SIZE);
  const transactions = await prisma.walletTransaction.findMany({
    where: historyWhere,
    orderBy: { createdAt: "desc" },
    skip: paging.skip,
    take: PAGE_SIZE,
  });

  // The price each purchase was shown at, so purchases and their refunds in
  // this list show what the customer actually saw. Top-ups show what they
  // added to the balance, converted the same way the balance is.
  const activationIds = transactions.map((tx) => tx.activationId).filter((id): id is string => Boolean(id));
  const [currencyConfig, shownRows] = await Promise.all([
    getCurrencyConfig(user.currency),
    activationIds.length
      ? prisma.activation.findMany({
          where: { id: { in: activationIds }, userId },
          select: { id: true, displayCurrency: true, displayPriceMinor: true },
        })
      : Promise.resolve([]),
  ]);
  const currency = currencyConfig ?? (await getDefaultCurrency());
  const usdConfig = (await readCurrencyConfig()).find((c) => c.code === "USD")!;
  const shownPrices = new Map(
    shownRows.map((a) => [a.id, { currency: a.displayCurrency, minor: a.displayPriceMinor }]),
  );
  // Every currency an admin has switched on; any customer may pay in any of
  // them, and the server checks the currency again on every quote.
  const fundingOptions = await getFundingOptions();
  const localOptions: LocalOption[] = fundingOptions.map(({ code, state }) => ({
    code,
    name: FUNDING_CURRENCIES[code].name,
    symbol: FUNDING_CURRENCIES[code].symbol,
    methods: FUNDING_CURRENCIES[code].methods,
    minMinor: state.minMinor,
    maxMinor: state.maxMinor,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add funds, then spend them on numbers. Refunds come straight back here.
        </p>
      </div>

      <div className="rounded-2xl bg-forest px-6 py-5">
        <p className="text-xs uppercase tracking-[0.14em] text-white/50">
          Wallet balance
        </p>
        <p className="mt-1.5 text-4xl font-semibold tabular-nums text-white">
          <DisplayAmount kobo={user.walletBalanceKobo} currency={user.currency} />
        </p>
      </div>

      <Suspense fallback={null}>
        <FundWallet
          walletCurrency={user.currency}
          options={localOptions}
          country={displayContext.country}
          usdt={{
            enabled: isCryptomusConfigured(),
            minCents: usdConfig.minTopUpMinor,
            maxCents: usdConfig.maxTopUpMinor,
          }}
          naira={{
            currency: currency.code,
            minTopUpMinor: currency.minTopUpMinor,
            maxTopUpMinor: currency.maxTopUpMinor,
            fundingProvider: currency.fundingProvider,
          }}
        />
      </Suspense>

      <section>
        <h2 className="text-sm font-semibold">Recent transactions</h2>

        {transactions.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-mint-soft text-forest">
              <WalletIcon className="h-5 w-5" />
            </span>
            <p className="mt-3 font-medium">No transactions yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Top-ups, purchases and refunds all show up here.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {transactions.map((tx) => {
              const meta = typeMeta[tx.type];
              // Only a settled credit is styled as money gained. A pending
              // top up is shown in the muted style, because reading it as
              // a green "+" would suggest a balance that has not moved.
              const settled = tx.status === "SUCCESSFUL";
              const credit = tx.amountKobo >= 0 && settled;
              return (
                <li key={tx.id} className="flex items-center gap-3.5 px-4 py-3">
                  <span
                    className={
                      credit
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-soft text-forest"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground"
                    }
                  >
                    <meta.icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tx.provider === CURRENCY_MOVE_PROVIDER ? "Currency changed" : meta.label}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tx.status === "SUCCESSFUL"
                        ? tx.description
                        : `${tx.description}, payment failed`}
                    </p>
                    {tx.paymentCurrency &&
                    isFundingCurrencyCode(tx.paymentCurrency) &&
                    tx.paymentAmountMinor !== null ? (
                      <p className="text-xs text-muted-foreground">
                        Paid {formatFundingAmount(tx.paymentAmountMinor, tx.paymentCurrency)}
                        {tx.paymentFeeMinor
                          ? `, including a ${formatFundingAmount(tx.paymentFeeMinor, tx.paymentCurrency)} fee`
                          : ""}
                      </p>
                    ) : null}
                  </div>

                  <time
                    dateTime={tx.createdAt.toISOString()}
                    className="hidden shrink-0 text-xs text-muted-foreground sm:block"
                  >
                    {tx.createdAt.toLocaleString("en-NG", dateFormat)}
                  </time>

                  <span
                    className={
                      credit
                        ? "shrink-0 text-sm font-semibold tabular-nums text-success"
                        : settled
                          ? "shrink-0 text-sm font-semibold tabular-nums"
                          : "shrink-0 text-sm font-semibold tabular-nums text-muted-foreground"
                    }
                  >
                    <DisplayAmount
                      kobo={Math.abs(tx.amountKobo)}
                      currency={tx.currency}
                      sign={settled ? (tx.amountKobo >= 0 ? "+" : "-") : ""}
                      recorded={tx.activationId ? shownPrices.get(tx.activationId) : null}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination basePath="/dashboard/wallet" total={total} className="mt-4" {...paging} />
      </section>
    </div>
  );
}
