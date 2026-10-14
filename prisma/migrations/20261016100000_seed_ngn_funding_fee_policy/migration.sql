-- Fees are now approved and enabled per currency in the admin panel
-- ("fee_policies_v1"), and no payment proceeds without an approved decision.
--
-- Naira funding already charges a processing fee (the admin's "topup_fee_percent"
-- setting, falling back to KoraPay's published 1.5%, capped at NGN 2,000 or the
-- cap saved on the NGN currency). So that existing Naira funding keeps working
-- exactly as it does today, this records that currently-effective fee as the
-- Naira policy, once, when no policy record exists yet. It is shown in the admin
-- panel as approved "by migration" so it can be reviewed, edited or switched off
-- there. It is never re-applied: an existing record is left alone.
DO $$
BEGIN
INSERT INTO "settings" ("key", "value", "updatedAt")
SELECT
  'fee_policies_v1',
  json_build_object(
    'wallet_funding:NGN',
    json_build_object(
      'kind', 'wallet_funding',
      'currency', 'NGN',
      'model', 'percent',
      'percent', COALESCE(
        (SELECT CASE WHEN value ~ '^[0-9]+(\.[0-9]+)?$' THEN value::float END FROM "settings" WHERE "key" = 'topup_fee_percent'),
        1.5
      ),
      'fixedMinor', 0,
      'capMinor', COALESCE(
        (SELECT CASE WHEN (value::json -> 'NGN' ->> 'feeCapMinor') ~ '^[0-9]+$' THEN (value::json -> 'NGN' ->> 'feeCapMinor')::bigint END
           FROM "settings" WHERE "key" = 'currency_config_v2'),
        (SELECT CASE WHEN value ~ '^[0-9]+$' THEN value::bigint END FROM "settings" WHERE "key" = 'topup_fee_cap_kobo'),
        200000
      ),
      'approved', true,
      'enabled', true,
      'approvedBy', 'migration: carried over the existing Naira funding fee',
      'approvedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  )::text,
  now()
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'fee_policies_v1');
EXCEPTION WHEN OTHERS THEN
    INSERT INTO "settings" ("key", "value", "updatedAt")
    VALUES (
      'fee_policies_v1',
      '{"wallet_funding:NGN":{"kind":"wallet_funding","currency":"NGN","model":"percent","percent":1.5,"fixedMinor":0,"capMinor":200000,"approved":true,"enabled":true,"approvedBy":"migration: carried over the existing Naira funding fee","approvedAt":null}}',
      now()
    )
    ON CONFLICT ("key") DO NOTHING;
END $$;
