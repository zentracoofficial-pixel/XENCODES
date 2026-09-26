-- Provider balance monitoring follow-up: two additive, nullable/defaulted
-- columns. Neither backfills nor touches existing rows in a breaking way.

-- AlterTable
ALTER TABLE "provider_balance_status" ADD COLUMN "lastSuccessfulCheckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "provider_balance_alerts" ADD COLUMN "delivered" BOOLEAN NOT NULL DEFAULT false;
