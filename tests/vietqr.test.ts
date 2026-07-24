import assert from "node:assert/strict";
import test from "node:test";
import { buildVietQrPayload, generateVietQrDataUrl } from "../lib/vietqr";

function crc16(value: string) {
  let crc = 0xffff;
  for (const character of value) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

test("VietQR payload includes the NAPAS account data, amount, reference, and valid CRC", () => {
  const payload = buildVietQrPayload({
    bankCode: "970415",
    accountNumber: "0123456789",
    accountName: "Cyfurden Studio",
    amountMinorUnits: BigInt(1250000),
    transferReference: "CYF-AB12CD",
  });

  assert.match(payload, /^00020101021238/);
  assert.match(payload, /A000000727/);
  assert.match(payload, /970415/);
  assert.match(payload, /0123456789/);
  assert.match(payload, /540512500/);
  assert.match(payload, /CYF-AB12CD/);
  assert.equal(payload.slice(-8, -4), "6304");
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
});

test("VietQR data URLs are generated only from valid account data", async () => {
  const dataUrl = await generateVietQrDataUrl({
    bankCode: "970415",
    accountNumber: "0123456789",
    accountName: "Cyfurden Studio",
    amountMinorUnits: "1250000",
    transferReference: "CYF-AB12CD",
  });
  assert.match(dataUrl, /^data:image\/png;base64,/);
  assert.throws(
    () =>
      buildVietQrPayload({
        bankCode: "9704",
        accountNumber: "0123456789",
        accountName: "Cyfurden Studio",
        amountMinorUnits: 100,
        transferReference: "CYF-AB12CD",
      }),
    /six-digit bank BIN/i,
  );
});
