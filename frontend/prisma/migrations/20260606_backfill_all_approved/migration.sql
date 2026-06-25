-- Per advertiser request: backfill ALL existing campaigns to status='approved'.
-- (The prior migration split rows by onChainId / verificationStatus; this
-- supersedes that for every row created before this migration ran.)
--
-- New campaigns created AFTER this migration still default to 'draft'.

UPDATE "campaigns"
SET "status" = 'approved',
    "submittedAt" = COALESCE("submittedAt", "createdAt"),
    "approvedAt"  = COALESCE("approvedAt", "updatedAt");
