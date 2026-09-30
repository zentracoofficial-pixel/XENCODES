-- CreateEnum
CREATE TYPE "ActivationRefundReason" AS ENUM ('NO_SMS_RECEIVED', 'PROVIDER_REFUNDED', 'CANCELLED_BY_CUSTOMER', 'ACTIVATION_EXPIRED', 'PROVIDER_FAILURE', 'CUSTOMER_SUPPORT', 'OTHER');

-- AlterTable
ALTER TABLE "activations" ADD COLUMN     "lastProviderStatusCheckAt" TIMESTAMP(3),
ADD COLUMN     "providerStatusCheckAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundNote" TEXT,
ADD COLUMN     "refundReason" "ActivationRefundReason",
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedByAdminEmail" TEXT,
ADD COLUMN     "refundedByAdminId" TEXT;
