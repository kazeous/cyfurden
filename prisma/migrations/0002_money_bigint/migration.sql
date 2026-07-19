ALTER TABLE "Product"
  ALTER COLUMN "priceCents" SET DATA TYPE BIGINT
  USING "priceCents"::BIGINT;

ALTER TABLE "ProductVariant"
  ALTER COLUMN "priceCents" SET DATA TYPE BIGINT
  USING "priceCents"::BIGINT;

ALTER TABLE "Order"
  ALTER COLUMN "subtotalCents" SET DATA TYPE BIGINT
  USING "subtotalCents"::BIGINT,
  ALTER COLUMN "totalCents" SET DATA TYPE BIGINT
  USING "totalCents"::BIGINT;

ALTER TABLE "OrderItem"
  ALTER COLUMN "unitPriceCents" SET DATA TYPE BIGINT
  USING "unitPriceCents"::BIGINT;
