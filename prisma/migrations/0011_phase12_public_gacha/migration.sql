-- Phase 12 keeps editable gacha records as the draft and publishes an
-- immutable JSON snapshot. Public play consumes only that snapshot, so draft
-- edits cannot leak before an explicit publish action.
ALTER TABLE "GachaConfig"
ADD COLUMN "guaranteedRarity" "GachaRarity" NOT NULL DEFAULT 'EPIC',
ADD COLUMN "publishedDocument" JSONB,
ADD COLUMN "publishedAt" TIMESTAMP(3);

ALTER TABLE "GachaConfig"
ADD CONSTRAINT "GachaConfig_guaranteedAt_check"
CHECK ("guaranteedAt" BETWEEN 1 AND 500);

ALTER TABLE "GachaPoolEntry"
ADD CONSTRAINT "GachaPoolEntry_weight_check"
CHECK ("weight" BETWEEN 1 AND 1000);

ALTER TABLE "GachaBanner"
ADD CONSTRAINT "GachaBanner_date_range_check"
CHECK (
  ("startsAt" IS NULL AND "endsAt" IS NULL)
  OR
  ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "startsAt" < "endsAt")
);
