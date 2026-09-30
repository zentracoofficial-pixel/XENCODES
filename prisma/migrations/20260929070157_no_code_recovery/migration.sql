-- CreateEnum
CREATE TYPE "NoCodeRecoveryStatusValue" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RecoveryEmailType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "RecoveryEmailDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "no_code_recovery_status" (
    "userId" TEXT NOT NULL,
    "status" "NoCodeRecoveryStatusValue" NOT NULL DEFAULT 'OPEN',
    "windowDays" INTEGER NOT NULL,
    "purchaseCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "noCodeCount" INTEGER NOT NULL,
    "affectedServices" JSONB NOT NULL,
    "affectedCountries" JSONB NOT NULL,
    "lastPurchaseAt" TIMESTAMP(3) NOT NULL,
    "lastNoCodeAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "recommendedServiceSlug" TEXT,
    "recommendedServiceName" TEXT,
    "recommendedCountrySlug" TEXT,
    "recommendedCountryName" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEmailedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_code_recovery_status_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "recovery_email_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "emailType" "RecoveryEmailType" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" "RecoveryEmailDeliveryStatus" NOT NULL,
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "sentByAdminId" TEXT,
    "sentByAdminEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "no_code_recovery_status_status_idx" ON "no_code_recovery_status"("status");

-- CreateIndex
CREATE INDEX "recovery_email_logs_userId_idx" ON "recovery_email_logs"("userId");

-- CreateIndex
CREATE INDEX "recovery_email_logs_createdAt_idx" ON "recovery_email_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "no_code_recovery_status" ADD CONSTRAINT "no_code_recovery_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_email_logs" ADD CONSTRAINT "recovery_email_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
