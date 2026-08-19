import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccountFactorCode,
  validateAccountCurrentFactor,
  validateAccountTotpBegin,
  validateAccountTotpCode,
  validateAccountTotpDisable,
} from "../lib/account-totp-validation";

test("account TOTP validation accepts only bounded lifecycle inputs", () => {
  assert.deepEqual(
    validateAccountTotpBegin({
      currentPassword: "current-password",
      purpose: "enable",
    }),
    {
      ok: true,
      value: { currentPassword: "current-password", purpose: "enable" },
    },
  );
  assert.equal(
    validateAccountTotpBegin({ currentPassword: "", purpose: "rotate" }).ok,
    false,
  );
  assert.equal(
    validateAccountTotpBegin({
      currentPassword: "x".repeat(129),
      purpose: "resync",
    }).ok,
    false,
  );
});

test("account factor validation distinguishes TOTP and recovery-code shape", () => {
  assert.equal(normalizeAccountFactorCode("  ABCDE-FGHIJ  "), "ABCDE-FGHIJ");
  assert.deepEqual(validateAccountTotpCode(" 123 456 "), {
    ok: true,
    value: "123456",
  });
  assert.equal(validateAccountTotpCode("12345").ok, false);
  assert.deepEqual(validateAccountCurrentFactor("ABCDE-FGHIJ"), {
    ok: true,
    value: "ABCDE-FGHIJ",
  });
  assert.equal(validateAccountCurrentFactor("ABCDE-FGHI").ok, false);
  assert.equal(validateAccountCurrentFactor("1234567").ok, false);
});

test("account TOTP disable requires password, current factor, and confirmation", () => {
  assert.equal(
    validateAccountTotpDisable({
      currentPassword: "current-password",
      currentFactorCode: "123456",
      confirmDisable: true,
    }).ok,
    true,
  );
  const missing = validateAccountTotpDisable({
    currentPassword: "",
    currentFactorCode: "",
    confirmDisable: false,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.errors["password-required"], true);
    assert.equal(missing.errors["code-required"], true);
    assert.equal(missing.errors["confirmation-required"], true);
  }
});
