-- Order-status, favorites, purchase-idempotency, provider-failure tracking,
-- low-balance dismissal state, and session-invalidation support.
--
-- All additions are new nullable columns, new tables with default values,
-- or columns with a default (sessionVersion) that back-fills existing rows
-- safely. No existing data is dropped, renamed, or reinterpreted.

-- AlterTable: low-balance dismissal memory + session invalidation stamp
ALTER TABLE "users" ADD COLUMN "lowBalanceDismissedAtKobo" INTEGER;
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: purchase idempotency key (nullable, so existing orders are unaffected)
ALTER TABLE "activations" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "activations_idempotencyKey_key" ON "activations"("idempotencyKey");

-- CreateTable: per-user favorite services
CREATE TABLE "favorite_services" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_services_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_services_userId_serviceSlug_key" ON "favorite_services"("userId", "serviceSlug");
CREATE INDEX "favorite_services_userId_idx" ON "favorite_services"("userId");

ALTER TABLE "favorite_services" ADD CONSTRAINT "favorite_services_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: per (provider, service, country) purchase-failure tracking
CREATE TABLE "provider_failure_stats" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "countrySlug" TEXT NOT NULL,
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "totalFails" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "flaggedAt" TIMESTAMP(3),

    CONSTRAINT "provider_failure_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_failure_stats_providerId_serviceSlug_countrySlug_key" ON "provider_failure_stats"("providerId", "serviceSlug", "countrySlug");
CREATE INDEX "provider_failure_stats_flaggedAt_idx" ON "provider_failure_stats"("flaggedAt");

-- CreateTable: failed-login attempts by IP, for cross-account rate limiting
CREATE TABLE "login_failures" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_failures_ip_createdAt_idx" ON "login_failures"("ip", "createdAt");
