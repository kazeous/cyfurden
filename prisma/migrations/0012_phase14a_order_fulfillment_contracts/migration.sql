-- Historical orders remain nullable because Cyfurden cannot infer how they
-- were fulfilled or invent missing customer contact and shipping data.
CREATE TYPE "OrderFulfillmentMethod" AS ENUM ('PICKUP', 'SHIP');

ALTER TABLE "Order"
  ADD COLUMN "customerSocialContact" TEXT,
  ADD COLUMN "fulfillmentMethod" "OrderFulfillmentMethod",
  ADD COLUMN "shippingAddress" TEXT,
  ADD COLUMN "shipmentCarrier" TEXT,
  ADD COLUMN "shipmentTrackingNumber" TEXT,
  ADD COLUMN "shipmentTrackingUrl" TEXT;

-- Existing transfer references were generated from unique reservation codes,
-- so preserving that booth-local uniqueness is safe and prevents collisions
-- between the shorter references generated for new reservations.
CREATE UNIQUE INDEX "Order_boothId_transferReference_key"
ON "Order"("boothId", "transferReference");

-- The checks apply only to Phase 14 orders. Historical rows retain a null
-- fulfillment method and therefore keep rendering without rewritten data.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_phase14_phone_check"
    CHECK (
      "fulfillmentMethod" IS NULL
      OR COALESCE("customerPhone" ~ '^[0-9]{1,10}$', false)
    ),
  ADD CONSTRAINT "Order_phase14_social_contact_check"
    CHECK (
      "fulfillmentMethod" IS NULL
      OR "customerSocialContact" IS NULL
      OR (
        char_length("customerSocialContact") BETWEEN 1 AND 200
        AND "customerSocialContact" !~ '[[:cntrl:]]'
      )
    ),
  ADD CONSTRAINT "Order_phase14_shipping_address_check"
    CHECK (
      "fulfillmentMethod" IS NULL
      OR (
        "fulfillmentMethod" = 'PICKUP'
        AND "shippingAddress" IS NULL
      )
      OR (
        "fulfillmentMethod" = 'SHIP'
        AND char_length(COALESCE(btrim("shippingAddress"), '')) BETWEEN 1 AND 500
      )
    ),
  ADD CONSTRAINT "Order_phase14_transfer_reference_check"
    CHECK (
      "fulfillmentMethod" IS NULL
      OR "transferReference" ~ '^[ -~]{1,10}$'
    ),
  ADD CONSTRAINT "Order_phase14_shipment_scope_check"
    CHECK (
      COALESCE("fulfillmentMethod" = 'SHIP', false)
      OR (
        "shipmentCarrier" IS NULL
        AND "shipmentTrackingNumber" IS NULL
        AND "shipmentTrackingUrl" IS NULL
      )
    ),
  ADD CONSTRAINT "Order_phase14_shipment_values_check"
    CHECK (
      (
        "shipmentCarrier" IS NULL
        OR (
          char_length(btrim("shipmentCarrier")) BETWEEN 1 AND 100
          AND "shipmentCarrier" !~ '[[:cntrl:]]'
        )
      )
      AND (
        "shipmentTrackingNumber" IS NULL
        OR (
          char_length(btrim("shipmentTrackingNumber")) BETWEEN 1 AND 120
          AND "shipmentTrackingNumber" !~ '[[:cntrl:]]'
        )
      )
      AND (
        "shipmentTrackingUrl" IS NULL
        OR (
          char_length(btrim("shipmentTrackingUrl")) BETWEEN 1 AND 500
          AND "shipmentTrackingUrl" ~ '^https?://'
          AND "shipmentTrackingUrl" !~ '[[:cntrl:]]'
        )
      )
    );
