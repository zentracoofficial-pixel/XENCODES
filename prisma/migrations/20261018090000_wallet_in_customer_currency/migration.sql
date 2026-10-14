-- Wallets are held in the customer's own currency, so a balance never moves
-- when exchange rates do. A purchase is converted once, at the moment it is
-- bought, and the exact amount taken from the wallet is recorded on the order
-- (chargeCurrency, chargeMinor) so a refund returns exactly that amount.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_currency_check";
ALTER TABLE "users" ADD CONSTRAINT "users_currency_check"
  CHECK ("currency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USD'));
ALTER TABLE "activations" DROP CONSTRAINT IF EXISTS "activations_currency_check";
ALTER TABLE "activations" ADD CONSTRAINT "activations_currency_check"
  CHECK ("currency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USD'));
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_currency_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_currency_check"
  CHECK ("currency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USD'));
-- A Naira payment into a wallet held in another currency records NGN as the
-- payment currency.
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_payment_currency_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_currency_check"
  CHECK ("paymentCurrency" IS NULL OR "paymentCurrency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS'));

ALTER TABLE "activations" ADD COLUMN "chargeCurrency" TEXT;
ALTER TABLE "activations" ADD COLUMN "chargeMinor" INTEGER;
ALTER TABLE "activations" ADD CONSTRAINT "activations_charge_currency_check"
  CHECK ("chargeCurrency" IS NULL OR "chargeCurrency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USD'));

-- GHS, KES, XAF, XOF, EGP and TZS are not yet approved on the Xencodes KoraPay
-- account, so they are switched off and shown to customers as "coming soon".
-- Their rates, limits and fee decisions are kept, so an admin can switch each
-- one back on from Admin > Currencies once KoraPay approves it.
DO $$
DECLARE
  states jsonb;
  c text;
BEGIN
  BEGIN
    SELECT value::jsonb INTO states FROM "settings" WHERE "key" = 'funding_currencies_v1';
  EXCEPTION WHEN OTHERS THEN states := NULL;
  END;
  IF states IS NULL OR jsonb_typeof(states) <> 'object' THEN RETURN; END IF;
  FOREACH c IN ARRAY ARRAY['GHS','KES','XAF','XOF','EGP','TZS'] LOOP
    IF jsonb_typeof(states -> c) = 'object' THEN
      states := jsonb_set(states, ARRAY[c, 'enabled'], 'false'::jsonb);
    END IF;
  END LOOP;
  UPDATE "settings" SET "value" = states::text, "updatedAt" = now() WHERE "key" = 'funding_currencies_v1';
END $$;
