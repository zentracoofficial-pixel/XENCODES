-- Orders describe Xencodes business concepts, not one supplier.
ALTER TABLE "activations" RENAME COLUMN "externalId" TO "providerOrderId";
ALTER TABLE "activations" RENAME COLUMN "markupKobo" TO "grossProfitKobo";

-- Existing rows were filled by the former supplier. Recorded as history
-- rather than erased, and the column default is dropped straight after so
-- nothing new can be written without naming its supplier.
ALTER TABLE "activations" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'smspool';
ALTER TABLE "activations" ALTER COLUMN "provider" DROP DEFAULT;

ALTER TABLE "activations" ADD COLUMN "targetMarginPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "activations" ADD COLUMN "pricingRule" TEXT NOT NULL DEFAULT 'legacy';

CREATE INDEX "activations_status_idx" ON "activations"("status");
CREATE INDEX "activations_createdAt_idx" ON "activations"("createdAt");

-- A per-service markup percent becomes an optional gross margin. There is no
-- correct conversion between the two, so stored overrides are cleared and
-- every service falls back to the platform margin rules until an admin sets
-- one deliberately. Null, not zero: zero is a real instruction meaning sell
-- at cost.
ALTER TABLE "service_settings" RENAME COLUMN "markupPercent" TO "grossMarginPercent";
ALTER TABLE "service_settings" ALTER COLUMN "grossMarginPercent" DROP DEFAULT;
ALTER TABLE "service_settings" ALTER COLUMN "grossMarginPercent" DROP NOT NULL;
UPDATE "service_settings" SET "grossMarginPercent" = NULL;

-- Ties a purchase or refund back to the order it was for, so an order's
-- detail view can show the money that moved with it.
ALTER TABLE "wallet_transactions" ADD COLUMN "activationId" TEXT;
CREATE INDEX "wallet_transactions_activationId_idx" ON "wallet_transactions"("activationId");

-- Per-country on/off switches keyed by the former supplier's country slugs.
-- Nothing reads them any more and the next supplier will name its countries
-- differently, so they are configuration for a supplier that no longer
-- exists rather than business history.
DROP TABLE IF EXISTS "country_settings";

-- Every setting the former supplier needed, including any API key an admin
-- ever saved into the database.
DELETE FROM "settings" WHERE "key" IN (
  'global_markup_percent',
  'usd_to_ngn_rate',
  'provider_api_key',
  'provider_name'
);
