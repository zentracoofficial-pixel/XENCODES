-- CreateEnum
CREATE TYPE "PaymentVerificationTrigger" AS ENUM ('WEBHOOK', 'RETURN_REDIRECT', 'USER_VIEW', 'ADMIN_MANUAL', 'RECONCILIATION_SWEEP');

-- CreateEnum
CREATE TYPE "PaymentVerificationResult" AS ENUM ('CREDITED', 'ALREADY_CREDITED', 'STILL_PENDING', 'FAILED', 'MISMATCH', 'PROVIDER_UNAVAILABLE', 'UNKNOWN_REFERENCE');

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "lastVerificationAttemptAt" TIMESTAMP(3),
ADD COLUMN     "verificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_verification_logs" (
    "id" TEXT NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "trigger" "PaymentVerificationTrigger" NOT NULL,
    "result" "PaymentVerificationResult" NOT NULL,
    "providerStatus" TEXT,
    "failureReason" TEXT,
    "adminId" TEXT,
    "adminEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_verification_logs_walletTransactionId_idx" ON "payment_verification_logs"("walletTransactionId");

-- CreateIndex
CREATE INDEX "payment_verification_logs_createdAt_idx" ON "payment_verification_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "payment_verification_logs" ADD CONSTRAINT "payment_verification_logs_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "wallet_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
