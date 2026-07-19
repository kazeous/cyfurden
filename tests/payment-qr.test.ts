import assert from "node:assert/strict";
import test from "node:test";
import {
  PAYMENT_QR_MAX_BYTES,
  PaymentQrValidationError,
  validatePaymentQrBytes,
} from "../lib/payment-qr";

test("recognizes supported payment QR image signatures", () => {
  assert.deepEqual(
    validatePaymentQrBytes(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ).contentType,
    "image/png",
  );
  assert.equal(
    validatePaymentQrBytes(Uint8Array.from([0xff, 0xd8, 0xff])).extension,
    "jpg",
  );
  assert.equal(
    validatePaymentQrBytes(
      Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
    ).extension,
    "webp",
  );
});

test("rejects empty, oversized, and disguised files", () => {
  for (const bytes of [
    new Uint8Array(),
    new Uint8Array(PAYMENT_QR_MAX_BYTES + 1),
    Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  ]) {
    assert.throws(
      () => validatePaymentQrBytes(bytes),
      PaymentQrValidationError,
    );
  }
});
