-- AlterTable: the customer's saved country, used only to recommend and
-- restrict local-currency wallet funding.
ALTER TABLE "users" ADD COLUMN "country" TEXT;

-- AlterTable: how a local-currency top-up was paid and converted. All null
-- for every existing row; nothing historical is changed.
ALTER TABLE "wallet_transactions"
  ADD COLUMN "paymentCurrency" TEXT,
  ADD COLUMN "paymentAmountMinor" INTEGER,
  ADD COLUMN "paymentFeeMinor" INTEGER,
  ADD COLUMN "fxRate" DOUBLE PRECISION,
  ADD COLUMN "paymentMethod" TEXT;

-- Only the funding currencies Xencodes accepts may be recorded (NGN is the
-- existing flow and leaves these columns null).
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_currency_check"
  CHECK ("paymentCurrency" IS NULL OR "paymentCurrency" IN ('GHS', 'KES', 'XAF', 'XOF', 'EGP', 'TZS'));
