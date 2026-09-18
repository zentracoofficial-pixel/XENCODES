-- CreateTable
CREATE TABLE "provider_sync_status" (
    "id" TEXT NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureError" TEXT,
    "servicesSynced" INTEGER,
    "countriesSynced" INTEGER,
    "offersSynced" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_sync_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synced_offers" (
    "id" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceColor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "countrySlug" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "countryFlag" TEXT NOT NULL,
    "dialCode" TEXT NOT NULL,
    "nationalDigits" INTEGER NOT NULL,
    "costKobo" INTEGER NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "stock" TEXT NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synced_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "synced_offers_serviceSlug_idx" ON "synced_offers"("serviceSlug");

-- CreateIndex
CREATE INDEX "synced_offers_countrySlug_idx" ON "synced_offers"("countrySlug");

-- CreateIndex
CREATE UNIQUE INDEX "synced_offers_serviceSlug_countrySlug_key" ON "synced_offers"("serviceSlug", "countrySlug");
