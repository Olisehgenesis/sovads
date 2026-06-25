-- Add AI_PLAN fields to campaign_tasks (additive).
-- No changes to existing columns/data; default values keep existing rows valid.

ALTER TABLE "campaign_tasks"
  ADD COLUMN "verificationPlan"  JSONB,
  ADD COLUMN "contractAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "planAuthor"        TEXT,
  ADD COLUMN "planModel"         TEXT,
  ADD COLUMN "planPrompt"        TEXT,
  ADD COLUMN "planGeneratedAt"   TIMESTAMP(3);
