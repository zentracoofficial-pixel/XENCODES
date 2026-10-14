-- Display currency preference (nullable: null means "default for my country").
ALTER TABLE "users" ADD COLUMN "displayCurrency" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_display_currency_check"
  CHECK ("displayCurrency" IS NULL OR "displayCurrency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USD'));

-- What KoraPay charged Xencodes per payment, recorded when reported.
ALTER TABLE "wallet_transactions" ADD COLUMN "providerFeeMinor" INTEGER;
ALTER TABLE "wallet_transactions" ADD COLUMN "providerVatMinor" INTEGER;
ALTER TABLE "wallet_transactions" ADD COLUMN "providerChargedMinor" INTEGER;
