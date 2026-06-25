-- Add campaign lifecycle status (additive).
-- New columns default to draft, but existing rows are backfilled to preserve
-- their effective live state.

ALTER TABLE "campaigns"
  ADD COLUMN "status"      TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt"  TIMESTAMP(3);

-- Backfill: any row that's already on-chain inherits its admin-verification
-- state. Rows with no onChainId stay as 'draft'.
UPDATE "campaigns"
SET "status" = CASE
    WHEN "verificationStatus" = 'approved' THEN 'approved'
    WHEN "verificationStatus" = 'rejected' THEN 'rejected'
    ELSE 'review'
  END,
  "submittedAt" = COALESCE("submittedAt", "createdAt"),
  "approvedAt"  = CASE
    WHEN "verificationStatus" = 'approved' THEN COALESCE("approvedAt", "updatedAt")
    ELSE NULL
  END
WHERE "onChainId" IS NOT NULL;

CREATE INDEX "campaigns_status_idx" ON "campaigns" ("status");
