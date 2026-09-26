-- Provider balance monitoring and low-credit alerting.
--
-- Two new tables. Neither touches an existing table, and neither has
-- anything to do with a customer's own wallet balance (User.walletBalanceKobo)
-- — this is the supplier's own account credit only.

-- CreateTable
CREATE TABLE "provider_balance_status" (
    "id" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckError" TEXT,
    "currentBalanceUsdCents" INTEGER,
    "isLow" BOOLEAN NOT NULL DEFAULT false,
    "lowSince" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_balance_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_balance_alerts" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "balanceUsdCents" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_balance_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_balance_alerts_providerId_sentAt_idx" ON "provider_balance_alerts"("providerId", "sentAt");
