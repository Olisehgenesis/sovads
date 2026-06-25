-- Track SDK heartbeat freshness per registered site.
-- Writes are throttled in the application layer (10-minute window) so this
-- is cheap to read for the Integration column on the publisher dashboard.
ALTER TABLE "publisher_sites"
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSdkVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "lastHref" TEXT;

CREATE INDEX IF NOT EXISTS "publisher_sites_lastSeenAt_idx"
  ON "publisher_sites" ("lastSeenAt");
