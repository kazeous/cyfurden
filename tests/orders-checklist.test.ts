import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBoothChecklist } from "../lib/orders-checklist";

const completePayment = {
  bankName: "VietinBank",
  bankCode: "970415",
  accountName: "Cyfurden Studio",
  accountNumber: "0123456789",
  paymentLabel: "Bank transfer",
  qrObjectKey: null,
  instructions: "Use the reservation code as the transfer reference.",
  disclaimer: "Transfers are reviewed manually.",
};

const completeStorefront = {
  name: "Cyfurden Studio",
  introduction: "Original convention goods.",
  eventVenue: "SECC Hall A",
  eventHours: "09:00–18:00",
};

test("the booth-readiness checklist exposes five independently completed items", () => {
  const checklist = evaluateBoothChecklist({
    hasLiveProduct: true,
    payment: completePayment,
    storefront: completeStorefront,
  });

  assert.equal(checklist.length, 5);
  assert.ok(checklist.every((item) => item.complete));
});

test("every missing readiness fact remains visible and incomplete", () => {
  const checklist = evaluateBoothChecklist({
    hasLiveProduct: false,
    payment: null,
    storefront: null,
  });

  assert.deepEqual(
    checklist.map(({ key, complete }) => ({ key, complete })),
    [
      { key: "live-product", complete: false },
      { key: "payment", complete: false },
      { key: "name", complete: false },
      { key: "description", complete: false },
      { key: "event", complete: false },
    ],
  );
});

test("payment readiness reuses the reservation snapshot predicate", () => {
  const checklist = evaluateBoothChecklist({
    hasLiveProduct: true,
    payment: {
      ...completePayment,
      bankName: "",
      accountName: "",
      accountNumber: "",
      qrObjectKey: "booths/booth-1/payment/qr.png",
    },
    storefront: completeStorefront,
  });

  assert.equal(
    checklist.find((item) => item.key === "payment")?.complete,
    true,
  );
});

test("a live product does not need tracked stock to complete readiness", () => {
  const checklist = evaluateBoothChecklist({
    hasLiveProduct: true,
    payment: completePayment,
    storefront: completeStorefront,
  });

  assert.equal(
    checklist.find((item) => item.key === "live-product")?.complete,
    true,
  );
});
