import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 17C lifecycle services are transactional, reasoned, audited, and bounded", async () => {
  const [lifecycle, access, actions, oracle] = await Promise.all([
    readSource("lib/platform-lifecycle.ts"),
    readSource("lib/platform-access.ts"),
    readSource("app/admin/actions.ts"),
    readSource("lib/oracle-uploads.ts"),
  ]);

  assert.match(lifecycle, /isolationLevel: "Serializable"/);
  assert.match(lifecycle, /attempt < 3/);
  assert.match(lifecycle, /normalizeReason/);
  assert.match(lifecycle, /reason\.trim\(\)\.replace/);
  assert.match(lifecycle, /authorizeTransactionalPlatformSession/);
  assert.match(lifecycle, /requireRecentPlatformStepUp/);
  assert.match(lifecycle, /assertPlatformUserDestructiveActionAllowed/);
  assert.match(lifecycle, /recordPlatformAudit/);
  assert.match(lifecycle, /serviceVersion: \{ increment: 1 \}/);
  assert.match(lifecycle, /formerOwnerNextRole: "ADMIN"/);
  assert.match(lifecycle, /owners\.length !== 1/);
  assert.match(lifecycle, /platformPolicy\.deletion\.coolingOffMs/);
  assert.match(lifecycle, /state: "FINALIZING"/);
  assert.match(lifecycle, /PlatformObjectDeleter/);
  assert.match(lifecycle, /PROVIDER_BLOCKED/);
  assert.match(access, /authorizeTransactionalPlatformSession/);
  assert.match(actions, /^"use server";/);
  assert.match(actions, /platformUserLifecycleAction/);
  assert.match(actions, /platformBoothLifecycleAction/);
  assert.doesNotMatch(actions, /export const initialPlatformLifecycle/);
  assert.match(oracle, /deleteOracleObjectsStrict/);
  assert.doesNotMatch(lifecycle, /db\.\$transaction\(\[/);
});

test("Phase 17C central booth freeze covers every approved public and private surface", async () => {
  const files = await Promise.all(
    [
      "lib/platform-targets.ts",
      "app/s/[slug]/page.tsx",
      "app/s/[slug]/actions.ts",
      "app/s/[slug]/reservation/[code]/page.tsx",
      "lib/public-reservation.ts",
      "lib/customer-transfer-reference.ts",
      "lib/authorization.ts",
      "app/manage/[boothId]/orders/page.tsx",
      "app/manage/[boothId]/actions.ts",
      "lib/team-access.ts",
      "app/api/uploads/presign/route.ts",
      "lib/oracle-presign.ts",
      "lib/oracle-uploads.ts",
      "lib/facebooth-public.ts",
      "lib/facebooth-projects.ts",
      "app/manage/[boothId]/facebooth/actions.ts",
      "lib/order-admin.ts",
      "lib/order-inventory.ts",
    ].map(async (path) => ({ path, source: await readSource(path) })),
  );
  const byPath = new Map(files.map((file) => [file.path, file.source]));

  assert.match(
    byPath.get("lib/platform-targets.ts")!,
    /requireBoothServiceAccess/,
  );
  for (const path of [
    "app/s/[slug]/page.tsx",
    "lib/public-reservation.ts",
    "lib/facebooth-public.ts",
  ]) {
    assert.match(byPath.get(path)!, /PUBLIC_READ/);
  }
  for (const path of [
    "app/s/[slug]/actions.ts",
    "lib/customer-transfer-reference.ts",
    "app/manage/[boothId]/actions.ts",
    "lib/team-access.ts",
    "app/api/uploads/presign/route.ts",
    "lib/oracle-presign.ts",
    "lib/oracle-uploads.ts",
    "lib/facebooth-projects.ts",
    "lib/order-admin.ts",
    "lib/order-inventory.ts",
  ]) {
    assert.match(byPath.get(path)!, /MUTATION/);
  }
  assert.match(byPath.get("lib/authorization.ts")!, /MEMBER_READ/);
  assert.match(
    byPath.get("app/manage/[boothId]/orders/page.tsx")!,
    /booth\.serviceState === "ACTIVE"/,
  );
  assert.match(
    byPath.get("app/s/[slug]/reservation/[code]/page.tsx")!,
    /serviceState: "ACTIVE"/,
  );
  assert.match(
    byPath.get("app/manage/[boothId]/facebooth/actions.ts")!,
    /requireActiveBoothRole/,
  );
});

test("Phase 17C removes owner hard deletion and adds bilingual responsive controls", async () => {
  const [workspaceActions, danger, controls, catalogue, adminStyles, shell] =
    await Promise.all([
      readSource("app/manage/[boothId]/actions.ts"),
      readSource("components/admin/booth-danger-zone.tsx"),
      readSource("components/platform-admin/platform-lifecycle-controls.tsx"),
      readSource("lib/i18n/platform-admin.ts"),
      readSource("components/platform-admin/platform-admin.module.css"),
      readSource("components/admin/admin-shell.tsx"),
    ]);

  assert.doesNotMatch(workspaceActions, /deleteBoothAction/);
  assert.doesNotMatch(danger, /deleteBoothAction/);
  assert.match(danger, /strings\.delete/);
  assert.match(controls, /useActionState/);
  assert.match(controls, /preview-ownership/);
  assert.match(controls, /finalize-ownership/);
  assert.match(controls, /finalize-deletion/);
  assert.match(controls, /minLength=\{1\}/);
  assert.match(catalogue, /Account lifecycle controls/);
  assert.match(catalogue, /Điều khiển vòng đời tài khoản/);
  assert.match(catalogue, /Booth lifecycle controls/);
  assert.match(catalogue, /Điều khiển vòng đời booth/);
  assert.match(adminStyles, /\.actionSection/);
  assert.match(adminStyles, /min-height: 2\.75rem/);
  assert.match(shell, /readOnlyWorkspace/);
  assert.match(shell, /<fieldset[^>]+disabled/);
});
