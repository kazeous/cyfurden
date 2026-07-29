import assert from "node:assert/strict";
import test from "node:test";
import { safeReturnTo } from "../lib/redirect";

test("safeReturnTo passes through a same-origin path", () => {
  assert.equal(safeReturnTo("/dashboard"), "/dashboard");
  assert.equal(safeReturnTo("/s/artist-booth"), "/s/artist-booth");
  assert.equal(safeReturnTo("/dashboard?tab=orders"), "/dashboard?tab=orders");
});

test("safeReturnTo rejects absolute http(s) URLs", () => {
  assert.equal(safeReturnTo("https://evil.example.com"), "/");
  assert.equal(safeReturnTo("http://evil.example.com"), "/");
  assert.equal(safeReturnTo("HTTPS://evil.example.com"), "/");
});

test("safeReturnTo rejects protocol-relative URLs", () => {
  // `//evil.example` is treated as a host swap by some clients.
  assert.equal(safeReturnTo("//evil.example.com/path"), "/");
});

test("safeReturnTo rejects other dangerous schemes", () => {
  assert.equal(safeReturnTo("javascript:alert(1)"), "/");
  assert.equal(safeReturnTo("data:text/html,<script>alert(1)</script>"), "/");
  assert.equal(safeReturnTo("file:///etc/passwd"), "/");
});

test("safeReturnTo falls back on empty / undefined / non-string", () => {
  assert.equal(safeReturnTo(""), "/");
  assert.equal(safeReturnTo(undefined), "/");
  assert.equal(safeReturnTo("/"), "/");
});

test("safeReturnTo allows paths with leading slashes only", () => {
  // A single '/' is the safest same-origin path and must be allowed.
  assert.equal(safeReturnTo("/"), "/");
  // Anything that doesn't start with '/' is not same-origin.
  assert.equal(safeReturnTo("dashboard"), "/");
  assert.equal(safeReturnTo("./dashboard"), "/");
  assert.equal(safeReturnTo("../dashboard"), "/");
});

test("safeReturnTo accepts a custom fallback", () => {
  assert.equal(
    safeReturnTo("https://evil.example", "/dashboard"),
    "/dashboard",
  );
  assert.equal(safeReturnTo(undefined, "/sign-in"), "/sign-in");
});
