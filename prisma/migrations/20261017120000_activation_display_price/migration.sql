-- The price a customer saw, in the currency they were viewing, at purchase time.
ALTER TABLE "activations" ADD COLUMN "displayCurrency" TEXT;
ALTER TABLE "activations" ADD COLUMN "displayPriceMinor" INTEGER;
