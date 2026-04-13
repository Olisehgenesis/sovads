-- Add viewer_cashouts table for GS cashout requests (1 SovPoint = 1 G$)
CREATE TABLE "viewer_cashouts" (
    "id"                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "viewerId"          TEXT NOT NULL,
    "wallet"            TEXT NOT NULL,
    "amount"            DOUBLE PRECISION NOT NULL,
    "claimRef"          TEXT UNIQUE,
    "status"            TEXT NOT NULL DEFAULT 'pending',
    "initiateTxHash"    TEXT,
    "distributeTxHash"  TEXT,
    "error"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "viewer_cashouts_viewerId_fkey"
        FOREIGN KEY ("viewerId") REFERENCES "viewer_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Index for lookups by viewerId and status
CREATE INDEX "viewer_cashouts_viewerId_idx" ON "viewer_cashouts"("viewerId");
CREATE INDEX "viewer_cashouts_status_idx" ON "viewer_cashouts"("status");
CREATE INDEX "viewer_cashouts_wallet_idx" ON "viewer_cashouts"("wallet");
