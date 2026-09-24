-- Per-account brute-force protection: a failed-attempt counter and an
-- optional lockout expiry, shared between the password and TOTP checks.
-- Both columns are additive and safely defaulted for every existing row.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);
