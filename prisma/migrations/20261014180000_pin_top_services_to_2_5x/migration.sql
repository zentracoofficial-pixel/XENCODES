-- Pin the four volume-driving services to a 2.5x price (the same 60% margin
-- they already sell at) so they stay there while the standard price is 3x.
-- Writes an explicit multiplier and clears any older margin percent; the
-- service's enabled flag is left as it is.
INSERT INTO "service_settings" ("slug", "enabled", "priceMultiplier", "updatedAt")
VALUES
  ('whatsapp', true, 2.5, now()),
  ('telegram', true, 2.5, now()),
  ('tiktok',   true, 2.5, now()),
  ('discord',  true, 2.5, now())
ON CONFLICT ("slug") DO UPDATE
SET "priceMultiplier" = 2.5,
    "grossMarginPercent" = NULL,
    "updatedAt" = now();
