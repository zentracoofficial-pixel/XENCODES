-- Multi-currency support. Every existing account and order was genuinely
-- NGN, so backfilling that default is exact, not a guess.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE "activations" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN';

-- AlterTable: synced_offers.costKobo held a supplier cost already converted
-- to NGN at sync time (the old single-currency adapter's own conversion).
-- After this release the adapter no longer converts at all and reports its
-- raw USD cost instead, so the column is renamed to say so, and every
-- existing row is cleared rather than reinterpreted: an old NGN-converted
-- number is not a USD-cents number under a new name, and this table is
-- explicitly a disposable browsing cache the app already falls back
-- gracefully off of when empty (see anyProviderCacheFresh()/
-- loadServiceCatalog() in src/lib/inventory.ts). The next scheduled or
-- manual sync repopulates it correctly; no purchase ever reads this table,
-- so nothing about buying a number is affected while it is empty.
DELETE FROM "synced_offers";
ALTER TABLE "synced_offers" RENAME COLUMN "costKobo" TO "costUsdCents";
