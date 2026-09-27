-- Serves the deliverability queries in src/lib/deliverability.ts, run on
-- every buy-page load (getCountryQualityForService/getPairQuality filter
-- on serviceSlug, sometimes countrySlug, and a recent createdAt cutoff).
CREATE INDEX "activations_serviceSlug_countrySlug_createdAt_idx" ON "activations"("serviceSlug", "countrySlug", "createdAt");
