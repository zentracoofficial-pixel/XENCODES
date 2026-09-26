-- Sales notification tracking. One new table; no existing table touched.

-- CreateEnum
CREATE TYPE "SalesNotificationType" AS ENUM ('WALLET_TOPUP', 'NUMBER_PURCHASE');

-- CreateEnum
CREATE TYPE "SalesNotificationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "sales_notifications" (
    "id" TEXT NOT NULL,
    "type" "SalesNotificationType" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "SalesNotificationStatus" NOT NULL,
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_notifications_type_transactionId_key" ON "sales_notifications"("type", "transactionId");
