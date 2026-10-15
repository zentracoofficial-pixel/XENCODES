-- USDT wallet funding through Cryptomus. A USDT payment records USDT as the
-- payment currency (the wallet itself is credited in US dollars).
ALTER TABLE "wallet_transactions" DROP CONSTRAINT IF EXISTS "wallet_transactions_payment_currency_check";
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_currency_check"
  CHECK ("paymentCurrency" IS NULL OR "paymentCurrency" IN ('NGN','GHS','KES','XAF','XOF','EGP','TZS','USDT'));

-- A funding currency is only offered with an approved fee decision. USDT
-- starts approved with no fee on our side (Cryptomus's own commission is set
-- in the Cryptomus dashboard); it can be changed on Admin > Currencies. An
-- existing decision is left alone.
DO $$
DECLARE
  fees jsonb;
  now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  BEGIN
    SELECT value::jsonb INTO fees FROM "settings" WHERE "key" = 'fee_policies_v1';
  EXCEPTION WHEN OTHERS THEN fees := NULL;
  END;
  IF fees IS NULL OR jsonb_typeof(fees) <> 'object' THEN fees := '{}'; END IF;
  IF NOT (fees ? 'wallet_funding:USDT') THEN
    fees := fees || jsonb_build_object(
      'wallet_funding:USDT',
      jsonb_build_object(
        'kind', 'wallet_funding',
        'currency', 'USDT',
        'model', 'percent',
        'percent', 0,
        'fixedMinor', 0,
        'capMinor', NULL,
        'approved', true,
        'enabled', false,
        'approvedBy', 'migration: USDT launch with no Xencodes fee',
        'approvedAt', now_iso
      )
    );
    INSERT INTO "settings" ("key", "value", "updatedAt") VALUES ('fee_policies_v1', fees::text, now())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();
  END IF;
END $$;
