-- Server II (webhook-reported suppliers) and Smart Pickup evidence.

CREATE TABLE "provider_order_states" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "code" TEXT,
    "text" TEXT,
    "errorCode" TEXT,
    "lastEventType" TEXT NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provider_order_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "provider_order_states_providerId_providerOrderId_key" ON "provider_order_states"("providerId", "providerOrderId");

CREATE TABLE "provider_attempts" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "countrySlug" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "providerOrderRef" TEXT,
    "detail" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "provider_attempts_providerId_createdAt_idx" ON "provider_attempts"("providerId", "createdAt");
CREATE INDEX "provider_attempts_serviceSlug_countrySlug_createdAt_idx" ON "provider_attempts"("serviceSlug", "countrySlug", "createdAt");
CREATE INDEX "provider_attempts_outcome_createdAt_idx" ON "provider_attempts"("outcome", "createdAt");
