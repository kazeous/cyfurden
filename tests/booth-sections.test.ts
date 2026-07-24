import assert from "node:assert/strict";
import test from "node:test";
import { boothSectionIds, canAccessBoothSection } from "../lib/booth-sections";

test("staff can access Orders and no other booth-management section", () => {
  const staffSections = boothSectionIds.filter((section) =>
    canAccessBoothSection("STAFF", section),
  );
  assert.deepEqual(staffSections, ["orders"]);
});

test("owners and admins retain every booth-management section", () => {
  for (const role of ["OWNER", "ADMIN"] as const) {
    assert.deepEqual(
      boothSectionIds.filter((section) => canAccessBoothSection(role, section)),
      [...boothSectionIds],
    );
  }
});
