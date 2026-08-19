import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAccountEmail,
  validateEmailReplacement,
  validatePasswordReplacement,
} from "../lib/account-credentials-validation";

test("password replacement enforces bounds, confirmation, and a distinct secret", () => {
  assert.equal(
    validatePasswordReplacement({
      currentPassword: "current-pass",
      newPassword: "replacement-pass",
      confirmationPassword: "replacement-pass",
    }).ok,
    true,
  );
  const same = validatePasswordReplacement({
    currentPassword: "same-password",
    newPassword: "same-password",
    confirmationPassword: "same-password",
  });
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.errors["same-password"], true);

  const mismatch = validatePasswordReplacement({
    currentPassword: "current-pass",
    newPassword: "replacement-pass",
    confirmationPassword: "different-pass",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.errors["confirmation-mismatch"], true);
  }
});

test("email replacement normalizes case and rejects malformed, repeated, or mismatched input", () => {
  assert.equal(
    normalizeAccountEmail("  OWNER@Example.COM  "),
    "owner@example.com",
  );

  const valid = validateEmailReplacement({
    currentEmail: "old@example.com",
    newEmail: " NEW@Example.com ",
    confirmationEmail: "new@example.COM",
    currentPassword: "current-pass",
    twoFactorRequired: false,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.value.newEmail, "new@example.com");

  const malformed = validateEmailReplacement({
    currentEmail: "old@example.com",
    newEmail: "not-an-email",
    confirmationEmail: "other@example.com",
    currentPassword: "current-pass",
    twoFactorRequired: true,
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.errors["email-invalid"], true);
    assert.equal(malformed.errors["confirmation-mismatch"], true);
    assert.equal(malformed.errors["second-factor-required"], true);
  }

  const repeated = validateEmailReplacement({
    currentEmail: "old@example.com",
    newEmail: "OLD@example.com",
    confirmationEmail: "old@example.com",
    currentPassword: "current-pass",
    twoFactorRequired: false,
  });
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.equal(repeated.errors["same-email"], true);
});
