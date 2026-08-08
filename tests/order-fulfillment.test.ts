import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeShippingAddress,
  orderShipmentSchema,
  publicOrderFulfillmentSchema,
} from "../lib/order-fulfillment";

test("pickup contact data is normalized without inventing an address", () => {
  const result = publicOrderFulfillmentSchema.parse({
    fulfillmentMethod: "PICKUP",
    customerPhone: " 0901234567 ",
    customerSocialContact: " @moon.artist ",
    shippingAddress: "  ignored for pickup  ",
  });

  assert.deepEqual(result, {
    fulfillmentMethod: "PICKUP",
    customerPhone: "0901234567",
    customerSocialContact: "@moon.artist",
    shippingAddress: null,
  });
});

test("shipping requires a normalized address and a phone of at most ten digits", () => {
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "SHIP",
      customerPhone: "0901234567",
      customerSocialContact: "",
      shippingAddress: "   ",
    }).success,
    false,
  );
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "SHIP",
      customerPhone: "0901234567",
      customerSocialContact: "",
      shippingAddress: "X".repeat(501),
    }).success,
    false,
  );
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "SHIP",
      customerPhone: "09012345678",
      customerSocialContact: "",
      shippingAddress: "1 Lantern Street",
    }).success,
    false,
  );
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "SHIP",
      customerPhone: "090-123-456",
      customerSocialContact: "",
      shippingAddress: "1 Lantern Street",
    }).success,
    false,
  );
  assert.equal(
    normalizeShippingAddress(
      "  1 Lantern Street \r\n Ward 2  \r\n\r\n\r\n HCMC ",
    ),
    "1 Lantern Street\nWard 2\n\nHCMC",
  );
});

test("social contact accepts names and web links but rejects unsafe schemes", () => {
  for (const social of [
    "Moon Artist",
    "@moon.artist",
    "https://example.com/moon",
  ]) {
    assert.equal(
      publicOrderFulfillmentSchema.safeParse({
        fulfillmentMethod: "PICKUP",
        customerPhone: "0901234567",
        customerSocialContact: social,
        shippingAddress: "",
      }).success,
      true,
    );
  }
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "PICKUP",
      customerPhone: "0901234567",
      customerSocialContact: "javascript:alert(1)",
      shippingAddress: "",
    }).success,
    false,
  );
  assert.equal(
    publicOrderFulfillmentSchema.safeParse({
      fulfillmentMethod: "PICKUP",
      customerPhone: "0901234567",
      customerSocialContact: "X".repeat(201),
      shippingAddress: "",
    }).success,
    false,
  );
});

test("manual shipment fields normalize and require an http tracking URL", () => {
  assert.deepEqual(
    orderShipmentSchema.parse({
      carrier: "  Vietnam Post ",
      trackingNumber: " VN-123 ",
      trackingUrl: " https://tracking.example/VN-123 ",
    }),
    {
      carrier: "Vietnam Post",
      trackingNumber: "VN-123",
      trackingUrl: "https://tracking.example/VN-123",
    },
  );
  assert.equal(
    orderShipmentSchema.safeParse({
      carrier: "Carrier",
      trackingNumber: "VN-123",
      trackingUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});
