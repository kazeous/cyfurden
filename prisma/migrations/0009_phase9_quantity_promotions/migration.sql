-- Preserve enough immutable context to distinguish a zero-priced promotion
-- reward from an ordinarily free catalogue item after the offer is edited.
ALTER TABLE "OrderItem"
ADD COLUMN "originalUnitPriceCents" BIGINT,
ADD COLUMN "promotionNameSnapshot" TEXT;

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_promotion_reward_snapshot_check"
CHECK (
  (
    "promotionNameSnapshot" IS NULL
    AND "originalUnitPriceCents" IS NULL
  )
  OR
  (
    "promotionNameSnapshot" IS NOT NULL
    AND "originalUnitPriceCents" IS NOT NULL
    AND "originalUnitPriceCents" >= 0
    AND "unitPriceCents" = 0
  )
);
