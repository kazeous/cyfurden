import assert from "node:assert/strict";
import test from "node:test";
import {
  boothSectionIds,
  canAccessBoothSection,
  getDefaultBoothSection,
} from "../lib/booth-sections";

test("staff can access Orders and no other booth-management section", () => {
  const staffSections = boothSectionIds.filter((section) =>
    canAccessBoothSection("STAFF", section),
  );
  assert.deepEqual(staffSections, ["orders"]);
  assert.equal(canAccessBoothSection("STAFF", "settings"), false);
});

test("owners and admins retain every booth-management section", () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    assert.deepEqual(
      boothSectionIds.filter((section) => canAccessBoothSection(role, section)),
      [...boothSectionIds],
    );
    assert.equal(canAccessBoothSection(role, "settings"), true);
  }
});

test("dashboard entry never sends staff through a restricted setup section", () => {
  assert.equal(getDefaultBoothSection("STAFF", "DRAFT"), "orders");
  assert.equal(getDefaultBoothSection("STAFF", "PUBLISHED"), "orders");
  assert.equal(getDefaultBoothSection("OWNER", "DRAFT"), "storefront");
  assert.equal(getDefaultBoothSection("ADMIN", "DRAFT"), "storefront");
  assert.equal(getDefaultBoothSection("OWNER", "PUBLISHED"), "orders");
});
