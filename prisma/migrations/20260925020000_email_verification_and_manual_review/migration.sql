-- Email verification hardening and manual verification review.
--
-- No existing data is touched or reinterpreted: every current user's
-- emailVerified value, every existing verification/reset token, and every
-- order, wallet balance and funding record are untouched by this migration.

-- CreateEnum
CREATE TYPE "ManualVerificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: mirrors PasswordResetToken.usedAt. Existing rows get NULL,
-- meaning "not (yet known to be) used" — exactly correct for every token
-- that predates this column, since none of them could have set it.
ALTER TABLE "email_verification_tokens" ADD COLUMN     "usedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "manual_verification_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ManualVerificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_verification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_verification_requests_userId_idx" ON "manual_verification_requests"("userId");

-- CreateIndex
CREATE INDEX "manual_verification_requests_status_idx" ON "manual_verification_requests"("status");

-- Partial unique index: at most one PENDING request per user, enforced by
-- Postgres itself rather than only by an application-level check-then-insert,
-- which two concurrent clicks of "Request manual verification" could race
-- past. Does not constrain APPROVED/REJECTED rows at all, so a user's full
-- history (a rejected request followed later by a new one) is unaffected.
CREATE UNIQUE INDEX "manual_verification_requests_one_pending_per_user"
    ON "manual_verification_requests"("userId")
    WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "manual_verification_requests" ADD CONSTRAINT "manual_verification_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
