-- Multi-provider support: an activation now records the supplier's own
-- service/country ids (reporting only), and the synced catalog cache and
-- its sync-status row are now scoped per provider instead of assuming
-- exactly one.

-- AlterTable
ALTER TABLE "activations" ADD COLUMN "providerServiceId" TEXT;
ALTER TABLE "activations" ADD COLUMN "providerCountryId" TEXT;

-- AlterTable: every existing cached offer was written by GrizzlySMS, the
-- only provider that has ever existed, so backfilling the default is exact,
-- not a guess.
ALTER TABLE "synced_offers" ADD COLUMN "providerId" TEXT NOT NULL DEFAULT 'grizzlysms';

-- DropIndex
DROP INDEX "synced_offers_serviceSlug_countrySlug_key";

-- CreateIndex
CREATE UNIQUE INDEX "synced_offers_serviceSlug_countrySlug_providerId_key" ON "synced_offers"("serviceSlug", "countrySlug", "providerId");

-- CreateIndex
CREATE INDEX "synced_offers_providerId_idx" ON "synced_offers"("providerId");

-- DataMigration: the sync-status table moves from one singleton row to one
-- row per provider, keyed by the provider's own registry id. GrizzlySMS is
-- the only provider that has ever synced, so its existing history (last
-- success/failure, counts) is carried forward under its real id rather than
-- lost.
UPDATE "provider_sync_status" SET "id" = 'grizzlysms' WHERE "id" = 'singleton';
