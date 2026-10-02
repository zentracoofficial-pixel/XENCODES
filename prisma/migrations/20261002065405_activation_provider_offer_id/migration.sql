-- AlterTable
ALTER TABLE "activations" ADD COLUMN     "providerOfferId" TEXT;

-- CreateIndex
CREATE INDEX "activations_serviceSlug_countrySlug_providerOfferId_created_idx" ON "activations"("serviceSlug", "countrySlug", "providerOfferId", "createdAt");
