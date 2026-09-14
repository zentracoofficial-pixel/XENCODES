-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED');

-- AlterTable
-- Every row that exists today is an already-settled purchase, refund or
-- adjustment, so SUCCESSFUL is the correct backfill. Only top-ups created
-- from here on begin as PENDING.
ALTER TABLE "wallet_transactions"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN "status" "WalletTransactionStatus" NOT NULL DEFAULT 'SUCCESSFUL',
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "providerTransactionId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "failureReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_providerReference_key" ON "wallet_transactions"("providerReference");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");
