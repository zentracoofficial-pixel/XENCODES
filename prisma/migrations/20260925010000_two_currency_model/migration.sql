-- Xencodes sells in exactly two currencies: NGN for Nigeria, USD for
-- everywhere else. Never a currency per country. Any stray value from the
-- brief window the general admin-managed currency list existed (before this
-- was simplified back down to a fixed pair) is normalized to NGN rather
-- than left to fail the CHECK constraint below: NGN was, and remains, the
-- platform's own default, so this is a correction back to what every
-- account without a deliberate non-NGN choice already was.
UPDATE "users" SET "currency" = 'NGN' WHERE "currency" NOT IN ('NGN', 'USD');
UPDATE "activations" SET "currency" = 'NGN' WHERE "currency" NOT IN ('NGN', 'USD');
UPDATE "wallet_transactions" SET "currency" = 'NGN' WHERE "currency" NOT IN ('NGN', 'USD');

ALTER TABLE "users" ADD CONSTRAINT "users_currency_check" CHECK ("currency" IN ('NGN', 'USD'));
ALTER TABLE "activations" ADD CONSTRAINT "activations_currency_check" CHECK ("currency" IN ('NGN', 'USD'));
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_currency_check" CHECK ("currency" IN ('NGN', 'USD'));
