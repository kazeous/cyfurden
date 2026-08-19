import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DISPLAY_NAME_MAX_INPUT,
  normalizeAccountDisplayName,
  validateAccountDisplayName,
} from "../lib/account-profile";

test("account display names normalize surrounding and repeated whitespace", () => {
  assert.equal(normalizeAccountDisplayName("  Mai\t  An \n"), "Mai An");
  assert.deepEqual(validateAccountDisplayName("  Mai\t  An \n"), {
    ok: true,
    value: "Mai An",
    visibleCharacters: 5,
  });
});

test("account display-name validation counts normalized Unicode characters", () => {
  assert.deepEqual(validateAccountDisplayName("e\u0301 x"), {
    ok: true,
    value: "é x",
    visibleCharacters: 2,
  });
  assert.deepEqual(validateAccountDisplayName("李"), {
    ok: false,
    error: "length",
  });
  assert.deepEqual(validateAccountDisplayName("A\u200b"), {
    ok: false,
    error: "length",
  });
  assert.deepEqual(validateAccountDisplayName("👩‍🎨 A"), {
    ok: true,
    value: "👩‍🎨 A",
    visibleCharacters: 2,
  });
  assert.equal(validateAccountDisplayName("a ".repeat(80)).ok, true);
  assert.deepEqual(validateAccountDisplayName("a".repeat(81)), {
    ok: false,
    error: "length",
  });
});

test("account display-name validation rejects empty and unbounded input", () => {
  assert.deepEqual(validateAccountDisplayName(" \t\n "), {
    ok: false,
    error: "required",
  });
  assert.deepEqual(
    validateAccountDisplayName(" ".repeat(ACCOUNT_DISPLAY_NAME_MAX_INPUT + 1)),
    { ok: false, error: "too-long" },
  );
  assert.deepEqual(validateAccountDisplayName(null), {
    ok: false,
    error: "required",
  });
});
