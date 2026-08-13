import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 17E keeps current dependency health private, bounded, and normalized", async () => {
  const [health, contract, overview, catalogue, headers] = await Promise.all([
    read("lib/platform-health.ts"),
    read("lib/platform-health-contract.ts"),
    read("app/admin/page.tsx"),
    read("lib/i18n/platform-admin.ts"),
    read("next.config.ts"),
  ]);

  assert.match(health, /import "server-only"/);
  assert.match(contract, /PLATFORM_HEALTH_PROBE_TIMEOUT_MS = 2_000/);
  assert.match(contract, /PLATFORM_HEALTH_CACHE_TTL_MS = 15_000/);
  assert.match(health, /HeadBucketCommand/);
  assert.match(health, /SELECT 1/);
  assert.match(health, /assertPlatformHealthAccess/);
  assert.match(contract, /ORACLE_ACCESS_DENIED/);
  assert.match(contract, /POSTGRES_TIMEOUT/);
  assert.doesNotMatch(`${health}\n${contract}`, /console\.(?:error|warn|log)/);
  assert.match(overview, /readPlatformCurrentHealth/);
  assert.match(catalogue, /Current health/);
  assert.match(catalogue, /not historical uptime/);
  assert.match(headers, /source: "\/admin\/:path\*"/);
  assert.match(headers, /private, no-cache, no-store/);
});

test("Phase 17E provides bounded TOTP step-up recovery back to platform operations", async () => {
  const [actions, controls, securityPage, settings] = await Promise.all([
    read("app/admin/actions.ts"),
    read("components/platform-admin/platform-lifecycle-controls.tsx"),
    read("app/account/security/page.tsx"),
    read("app/account/security/two-factor-settings.tsx"),
  ]);

  assert.match(actions, /code: error instanceof PlatformLifecycleError/);
  assert.match(controls, /state\.code === "STEP_UP_REQUIRED"/);
  assert.match(controls, /\/account\/security\?returnTo=/);
  assert.match(securityPage, /\^\\\/admin\(\?:\\\/\|\$\)/);
  assert.match(
    securityPage,
    /parsed\.origin !== "https:\/\/cyfurden\.invalid"/,
  );
  assert.match(settings, /router\.push\(returnTo\)/);
});

test("Phase 17E completes defensive audit date and scalar redaction", async () => {
  const [audit, inventory, auditPage] = await Promise.all([
    read("lib/platform-audit.ts"),
    read("lib/platform-inventory.ts"),
    read("app/admin/audit/page.tsx"),
  ]);

  assert.match(audit, /redactPlatformAuditText/);
  assert.match(audit, /database\\s\*url/);
  assert.match(audit, /object\\s\*key/);
  assert.match(inventory, /date\.toISOString\(\)\.slice\(0, 10\) !== value/);
  assert.match(inventory, /action: redactPlatformInventoryText/);
  assert.match(inventory, /correlationId: redactPlatformInventoryText/);
  for (const filter of [
    "actor",
    "targetType",
    "targetId",
    "action",
    "from",
    "to",
  ]) {
    assert.match(auditPage, new RegExp(`name="${filter}"`));
  }
});

test("Phase 17E adds no historical observer, queue, cron, or public health route", async () => {
  const [health, contract, packageJson] = await Promise.all([
    read("lib/platform-health.ts"),
    read("lib/platform-health-contract.ts"),
    read("package.json"),
  ]);
  assert.doesNotMatch(`${health}\n${contract}`, /uptime|incident|SLA|history/i);
  assert.doesNotMatch(packageJson, /redis|bullmq|cron/i);
  await assert.rejects(read("app/api/admin/health/route.ts"));
});
