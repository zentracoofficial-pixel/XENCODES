-- Why the last send attempt failed, when it did. Additive and nullable, so
-- existing campaign rows are untouched.
ALTER TABLE "email_campaigns" ADD COLUMN "failureReason" TEXT;
