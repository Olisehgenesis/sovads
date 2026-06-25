-- Phase 2 of multi-type attention marketplace.
-- Additive: extend campaign_tasks with surface metadata and add survey_sessions.

ALTER TABLE "campaign_tasks"
  ADD COLUMN "surface"          TEXT    NOT NULL DEFAULT 'attached',
  ADD COLUMN "display"          JSONB,
  ADD COLUMN "parentCampaignId" TEXT;

CREATE INDEX "campaign_tasks_surface_active_idx"
  ON "campaign_tasks" ("surface", "active");

CREATE INDEX "campaign_tasks_parentCampaignId_idx"
  ON "campaign_tasks" ("parentCampaignId");

-- Multi-step survey state. Aggregated answers live in Turso task_responses;
-- only the per-viewer session pointer + lifecycle timestamps live in Postgres.
CREATE TABLE "survey_sessions" (
  "id"           TEXT         PRIMARY KEY,
  "taskId"       TEXT         NOT NULL,
  "wallet"       TEXT,
  "fingerprint"  TEXT         NOT NULL,
  "status"       TEXT         NOT NULL DEFAULT 'in_progress',
  "currentStep"  INTEGER      NOT NULL DEFAULT 0,
  "totalSteps"   INTEGER      NOT NULL,
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"  TIMESTAMP(3),
  "abandonedAt"  TIMESTAMP(3),
  "lastSeenAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata"     JSONB,
  CONSTRAINT "survey_sessions_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "campaign_tasks"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "survey_sessions_taskId_status_idx"
  ON "survey_sessions" ("taskId", "status");

CREATE INDEX "survey_sessions_wallet_idx"
  ON "survey_sessions" ("wallet");

CREATE INDEX "survey_sessions_fingerprint_taskId_idx"
  ON "survey_sessions" ("fingerprint", "taskId");
