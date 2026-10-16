-- Sync run tracking: a per-provider lock, the latest run's outcome, and history.
ALTER TABLE "provider_sync_status"
  ADD COLUMN "runningSince" TIMESTAMP(3),
  ADD COLUMN "lastStartedAt" TIMESTAMP(3),
  ADD COLUMN "lastFinishedAt" TIMESTAMP(3),
  ADD COLUMN "lastDurationMs" INTEGER,
  ADD COLUMN "lastResult" TEXT,
  ADD COLUMN "lastMessage" TEXT;

CREATE TABLE "provider_sync_runs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "servicesSynced" INTEGER,
    "countriesSynced" INTEGER,
    "offersSynced" INTEGER,
    "countriesTotal" INTEGER,
    "countriesRead" INTEGER,
    "message" TEXT,

    CONSTRAINT "provider_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_sync_runs_providerId_startedAt_idx" ON "provider_sync_runs"("providerId", "startedAt");
