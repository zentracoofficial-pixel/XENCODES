-- Rename money columns from cents to kobo (Naira minor unit).
-- Hand-written as RENAME so existing balances/prices are preserved.
ALTER TABLE "users" RENAME COLUMN "walletBalanceCents" TO "walletBalanceKobo";
ALTER TABLE "activations" RENAME COLUMN "priceCents" TO "priceKobo";
ALTER TABLE "wallet_transactions" RENAME COLUMN "amountCents" TO "amountKobo";
