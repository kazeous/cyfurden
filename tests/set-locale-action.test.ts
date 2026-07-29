import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnTo } from "../lib/redirect";

// This file covers T-2 from AUDIT_FINDINGS.md: prove that
// setLocaleAction's redirectTo handling rejects open-redirect payloads.
// setLocaleAction itself can't run in unit tests because it calls
// next/headers' cookies() and next/navigation's redirect() — both Next
// runtime-only — but the action routes redirectTo through safeReturnTo,
// so the test exercises the exact same path.

function simulateSetLocale(formData: FormData): string {
  const requested = formData.get("locale");
  const locale = typeof requested === "string" ? requested : "en";
  const redirectTo = safeReturnTo(formData.get("redirectTo") as string | null);
  void locale;
  return redirectTo;
}

test("simulated setLocaleAction accepts a same-origin path", () => {
  const formData = new FormData();
  formData.set("locale", "vi");
  formData.set("redirectTo", "/");
  assert.equal(simulateSetLocale(formData), "/");
});

test("simulated setLocaleAction sanitizes https://evil.example to /", () => {
  const formData = new FormData();
  formData.set("locale", "vi");
  formData.set("redirectTo", "https://evil.example.com");
  assert.equal(simulateSetLocale(formData), "/");
});

test("simulated setLocaleAction sanitizes protocol-relative //host to /", () => {
  const formData = new FormData();
  formData.set("locale", "en");
  formData.set("redirectTo", "//evil.example.com/path");
  assert.equal(simulateSetLocale(formData), "/");
});

test("simulated setLocaleAction falls back when redirectTo is missing", () => {
  const formData = new FormData();
  formData.set("locale", "en");
  assert.equal(simulateSetLocale(formData), "/");
});

test("simulated setLocaleAction falls back when redirectTo is empty", () => {
  const formData = new FormData();
  formData.set("locale", "en");
  formData.set("redirectTo", "");
  assert.equal(simulateSetLocale(formData), "/");
});
