-- AlterEnum
ALTER TYPE "ActivationStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "activations" ADD COLUMN     "markupKobo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "providerCostKobo" INTEGER NOT NULL DEFAULT 0;
