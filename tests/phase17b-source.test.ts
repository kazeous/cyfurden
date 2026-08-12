import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 17B installs only the authorized read-only platform routes", async () => {
  const routePaths = [
    "app/admin/layout.tsx",
    "app/admin/page.tsx",
    "app/admin/users/page.tsx",
    "app/admin/users/[userId]/page.tsx",
    "app/admin/booths/page.tsx",
    "app/admin/booths/[boothId]/page.tsx",
    "app/admin/storage/page.tsx",
    "app/admin/audit/page.tsx",
  ];
  const sources = await Promise.all(routePaths.map(readSource));
  const layout = sources[0]!;
  const audit = sources.at(-1)!;

  assert.match(layout, /requirePlatformPermission\("platform\.read"\)/);
  assert.match(layout, /dynamic = "force-dynamic"/);
  assert.match(layout, /revalidate = 0/);
  assert.match(layout, /readPlatformShell\(access\)/);
  assert.match(audit, /requirePlatformPermission\("audit\.read"\)/);

  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /["']use server["']/);
    assert.doesNotMatch(source, /<form[^>]+action=/);
    if (index > 0) {
      assert.match(source, /requirePlatformPermission\(/);
    }
  }

  const joined = sources.join("\n");
  for (const forbidden of [
    "suspendUser",
    "restoreUser",
    "revokeSession",
    "transferOwnership",
    "finalizeDeletion",
    "reconcileStorage",
  ]) {
    assert.doesNotMatch(joined, new RegExp(forbidden));
  }
});

test("Phase 17B inventory is bounded, paginated, operational, and defensive", async () => {
  const inventory = await readSource("lib/platform-inventory.ts");

  assert.match(inventory, /import \{ db \} from "@\/lib\/db"/);
  assert.match(inventory, /PLATFORM_INVENTORY_PAGE_SIZE = 20/);
  assert.match(inventory, /PLATFORM_AUDIT_PAGE_SIZE = 30/);
  assert.match(inventory, /MAX_SEARCH_LENGTH = 100/);
  assert.match(inventory, /assertPlatformAccess\(access, "platform\.read"\)/);
  assert.match(inventory, /assertPlatformAccess\(access, "audit\.read"\)/);
  assert.match(inventory, /skip: \(page - 1\) \* PLATFORM_INVENTORY_PAGE_SIZE/);
  assert.match(inventory, /take: PLATFORM_INVENTORY_PAGE_SIZE/);
  assert.match(inventory, /take: PLATFORM_AUDIT_PAGE_SIZE/);
  assert.match(inventory, /mode: "insensitive"/);
  assert.match(inventory, /readBoothStorageUsage/);
  assert.match(inventory, /retainedOrderReferences: booth\._count\.orders/);
  assert.match(inventory, /safeAuditMetadataKeys/);
  assert.match(inventory, /"\[REDACTED\]"/);
  assert.doesNotMatch(inventory, /db\.order\.(find|aggregate|groupBy)/);
  assert.doesNotMatch(inventory, /db\.boothPaymentInstruction/);
  assert.doesNotMatch(inventory, /db\.storefrontConfig/);
});

test("Phase 17B shell is bilingual, responsive, and private-cache safe", async () => {
  const [catalogue, nav, styles, config] = await Promise.all([
    readSource("lib/i18n/platform-admin.ts"),
    readSource("components/platform-admin/platform-admin-nav.tsx"),
    readSource("components/platform-admin/platform-admin.module.css"),
    readSource("next.config.ts"),
  ]);

  assert.match(catalogue, /englishPlatformAdminCatalogue/);
  assert.match(catalogue, /vietnamesePlatformAdminCatalogue/);
  assert.match(catalogue, /Quản trị nền tảng/);
  assert.match(catalogue, /Sales, order, customer, bank, and transfer data/);
  for (const route of [
    "/admin",
    "/admin/users",
    "/admin/booths",
    "/admin/storage",
    "/admin/audit",
  ]) {
    assert.match(nav, new RegExp(`href: "${route.replaceAll("/", "\\/")}"`));
  }
  assert.doesNotMatch(nav, /\/admin\/health/);
  assert.match(styles, /^\/\* Hallmark · genre: editorial/m);
  assert.match(styles, /macrostructure: Index-First/);
  assert.match(styles, /min-height: 2\.75rem/);
  assert.match(styles, /@media \(min-width: 40rem\)/);
  assert.match(styles, /@media \(min-width: 60rem\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /transition-all/);
  assert.doesNotMatch(styles, /100vw/);
  assert.match(config, /source: "\/admin\/:path\*"/);
  assert.match(
    config,
    /private, no-cache, no-store, max-age=0, must-revalidate/,
  );
  assert.match(config, /noindex, nofollow, noarchive/);
});
