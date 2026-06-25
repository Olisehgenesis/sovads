-- Add CTA task system for campaigns.
-- Two new tables only; no changes to existing tables/columns.

-- ── campaign_tasks ─────────────────────────────────────────────────────────────
CREATE TABLE "campaign_tasks" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "campaignId"    TEXT NOT NULL,
    "kind"          TEXT NOT NULL,                 -- VISIT_URL | SOCIAL_FOLLOW | QUIZ | STAKE_GS | CONTRACT_CALL | SIGN_MESSAGE
    "label"         TEXT NOT NULL,
    "description"   TEXT,
    "config"        JSONB NOT NULL DEFAULT '{}'::jsonb,
    "rewardPoints"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardGs"      DOUBLE PRECISION,
    "budgetGs"      DOUBLE PRECISION,
    "spentGs"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxPerWallet"  INTEGER NOT NULL DEFAULT 1,
    "cooldownSecs"  INTEGER NOT NULL DEFAULT 0,
    "verifier"      TEXT NOT NULL DEFAULT 'ORACLE', -- ORACLE | ONCHAIN_EVENT | SELF_SIGNED | STAKE_PROOF
    "active"        BOOLEAN NOT NULL DEFAULT TRUE,
    "startDate"     TIMESTAMP(3),
    "endDate"       TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_tasks_campaignId_fkey"
        FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "campaign_tasks_campaignId_idx" ON "campaign_tasks"("campaignId");
CREATE INDEX "campaign_tasks_active_idx"     ON "campaign_tasks"("active");

-- ── task_completions ──────────────────────────────────────────────────────────
CREATE TABLE "task_completions" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "taskId"        TEXT NOT NULL,
    "viewerId"      TEXT NOT NULL,
    "wallet"        TEXT,
    "fingerprint"   TEXT NOT NULL,
    "proof"         JSONB,
    "status"        TEXT NOT NULL DEFAULT 'pending', -- pending | verified | rejected | paid | failed
    "rewardPoints"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rewardGs"      DOUBLE PRECISION,
    "claimRef"      TEXT UNIQUE,                     -- bytes32 keccak256(taskId, wallet, nonce)
    "nonce"         TEXT,
    "deadline"      TEXT,
    "signature"     TEXT,                            -- operator EIP-712 sig for SovAdsStreaming claim
    "payoutTxHash"  TEXT,
    "error"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt"    TIMESTAMP(3),
    "paidAt"        TIMESTAMP(3),
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "task_completions_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "campaign_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "task_completions_viewerId_fkey"
        FOREIGN KEY ("viewerId") REFERENCES "viewer_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "task_completions_taskId_status_idx"      ON "task_completions"("taskId", "status");
CREATE INDEX "task_completions_wallet_idx"             ON "task_completions"("wallet");
CREATE INDEX "task_completions_fingerprint_taskId_idx" ON "task_completions"("fingerprint", "taskId");
