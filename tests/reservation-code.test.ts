import assert from "node:assert/strict";
import test from "node:test";
import { parseReservationCode, reservationPath } from "../lib/reservation-code";

test("reservation codes accept only the generated public shape", () => {
  const code = "CYF-0123456789ABCDEF0123";
  assert.equal(parseReservationCode(code), code);
  assert.equal(parseReservationCode(""), null);
  assert.equal(parseReservationCode("CYF-0123"), null);
  assert.equal(parseReservationCode("cyf-0123456789abcdef0123"), null);
  assert.equal(parseReservationCode("//evil.example/x"), null);
  assert.equal(parseReservationCode("https://evil.example/x"), null);
  assert.equal(parseReservationCode(["CYF-0123456789ABCDEF0123"]), null);
});

test("reservation paths remain same-origin for encoded route segments", () => {
  const path = reservationPath("artist-booth", "//evil.example/x");
  const resolved = new URL(path, "https://cyfurden.example");

  assert.equal(resolved.origin, "https://cyfurden.example");
  assert.equal(
    resolved.pathname,
    "/s/artist-booth/reservation/%2F%2Fevil.example%2Fx",
  );
});
