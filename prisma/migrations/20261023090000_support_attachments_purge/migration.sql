-- A closed ticket's files are deleted: the bytes go, the name stays.
ALTER TABLE "support_attachments" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "support_attachments" ADD COLUMN "purgedAt" TIMESTAMP(3);
