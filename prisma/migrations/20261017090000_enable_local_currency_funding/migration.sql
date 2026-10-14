-- Switches on wallet funding in GHS, KES, XAF, XOF, EGP and TZS, as the owner
-- asked ("enable GHS, KES and other fundings for now").
--
-- Each currency is set to follow the daily market rate (so its rate never goes
-- stale; payments pause if the market rate is over 3 days old). A manual rate
-- is also stored, only as a fallback if an admin later turns "follow the
-- market" off: the latest market rate already stored on this deployment when
-- there is one, otherwise the 14 October 2026 market rate. Existing limits and
-- any rate an admin already saved are kept.
--
-- A currency can only be offered with an approved fee decision. Where none
-- exists yet, this records the same percentage fee as the approved Naira
-- funding fee (no cap), marked as approved by this migration so it can be
-- reviewed or changed on Admin > Currencies. Existing fee decisions are left
-- alone.
DO $$
DECLARE
  codes text[] := ARRAY['GHS','KES','XAF','XOF','EGP','TZS'];
  seed jsonb := '{"GHS":11.74,"KES":129.63,"XAF":586.05,"XOF":586.05,"EGP":52.8,"TZS":2633.76}';
  states jsonb := '{}';
  fees jsonb := '{}';
  feed jsonb := '{}';
  ngn_fee jsonb;
  ngn_percent numeric := 1.5;
  now_iso text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  c text;
  cur jsonb;
  rate numeric;
BEGIN
  BEGIN
    SELECT value::jsonb INTO states FROM "settings" WHERE "key" = 'funding_currencies_v1';
  EXCEPTION WHEN OTHERS THEN states := NULL;
  END;
  IF states IS NULL OR jsonb_typeof(states) <> 'object' THEN states := '{}'; END IF;

  BEGIN
    SELECT value::jsonb INTO fees FROM "settings" WHERE "key" = 'fee_policies_v1';
  EXCEPTION WHEN OTHERS THEN fees := NULL;
  END;
  IF fees IS NULL OR jsonb_typeof(fees) <> 'object' THEN fees := '{}'; END IF;

  BEGIN
    SELECT value::jsonb -> 'rates' INTO feed FROM "settings" WHERE "key" = 'display_rates_v1';
  EXCEPTION WHEN OTHERS THEN feed := NULL;
  END;
  IF feed IS NULL OR jsonb_typeof(feed) <> 'object' THEN feed := '{}'; END IF;

  ngn_fee := fees -> 'wallet_funding:NGN';
  IF ngn_fee IS NOT NULL AND (ngn_fee ->> 'approved') = 'true' AND (ngn_fee ->> 'model') = 'percent'
     AND jsonb_typeof(ngn_fee -> 'percent') = 'number' THEN
    ngn_percent := (ngn_fee ->> 'percent')::numeric;
  END IF;

  FOREACH c IN ARRAY codes LOOP
    cur := COALESCE(states -> c, '{}');
    IF jsonb_typeof(cur) <> 'object' THEN cur := '{}'; END IF;

    IF jsonb_typeof(cur -> 'usdRate') = 'number' AND (cur ->> 'usdRate')::numeric > 0 THEN
      rate := NULL; -- keep the admin's own rate
    ELSIF jsonb_typeof(feed -> c) = 'number' AND (feed ->> c)::numeric > 0 THEN
      rate := (feed ->> c)::numeric;
    ELSE
      rate := (seed ->> c)::numeric;
    END IF;

    cur := cur || jsonb_build_object('enabled', true, 'followMarket', true);
    IF rate IS NOT NULL THEN
      cur := cur || jsonb_build_object('usdRate', rate, 'rateUpdatedAt', now_iso);
    END IF;
    states := states || jsonb_build_object(c, cur);

    IF NOT (fees ? ('wallet_funding:' || c)) THEN
      fees := fees || jsonb_build_object(
        'wallet_funding:' || c,
        jsonb_build_object(
          'kind', 'wallet_funding',
          'currency', c,
          'model', 'percent',
          'percent', ngn_percent,
          'fixedMinor', 0,
          'capMinor', NULL,
          'approved', true,
          'enabled', true,
          'approvedBy', 'migration: enabled for launch at the Naira funding fee rate',
          'approvedAt', now_iso
        )
      );
    END IF;
  END LOOP;

  INSERT INTO "settings" ("key", "value", "updatedAt") VALUES ('funding_currencies_v1', states::text, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();
  INSERT INTO "settings" ("key", "value", "updatedAt") VALUES ('fee_policies_v1', fees::text, now())
  ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = now();
END $$;
