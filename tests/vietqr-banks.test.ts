import assert from "node:assert/strict";
import test from "node:test";
import {
  findVietQrBank,
  resolveVietQrBank,
  vietQrBanks,
} from "../lib/vietqr-banks";

test("VietQR bank options have unique six-digit BIN values", () => {
  assert.equal(vietQrBanks.length, 65);
  assert.equal(new Set(vietQrBanks.map(({ bin }) => bin)).size, 65);

  for (const bank of vietQrBanks) {
    assert.match(bank.bin, /^\d{6}$/);
    assert.ok(bank.shortName);
    assert.ok(bank.name);
  }
});

test("bank lookup supports BIN values and legacy names without exposing BIN input", () => {
  assert.equal(findVietQrBank("970436")?.shortName, "Vietcombank");
  assert.equal(findVietQrBank("VCB")?.bin, "970436");
  assert.equal(findVietQrBank("Vietcombank")?.bin, "970436");
  assert.equal(
    findVietQrBank("Ngân hàng TMCP Ngoại Thương Việt Nam")?.bin,
    "970436",
  );
  assert.equal(resolveVietQrBank("", "VCB")?.bin, "970436");
  assert.equal(findVietQrBank("not-a-bank"), undefined);
});
