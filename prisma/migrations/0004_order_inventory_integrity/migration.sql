ALTER TABLE "Order"
  ADD COLUMN "paymentSnapshot" JSONB;

ALTER TABLE "OrderItem"
  ADD COLUMN "inventoryDebited" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_priceCents_nonnegative" CHECK ("priceCents" >= 0);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_priceCents_nonnegative" CHECK ("priceCents" IS NULL OR "priceCents" >= 0),
  ADD CONSTRAINT "ProductVariant_stockQuantity_nonnegative" CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_subtotalCents_nonnegative" CHECK ("subtotalCents" >= 0),
  ADD CONSTRAINT "Order_totalCents_nonnegative" CHECK ("totalCents" >= 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_unitPriceCents_nonnegative" CHECK ("unitPriceCents" >= 0),
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
