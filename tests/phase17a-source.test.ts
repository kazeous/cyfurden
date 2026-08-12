import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 17A installs bounded Better Auth admin and TOTP capabilities", async () => {
  const [auth, authClient, authRoute, access, policy] = await Promise.all([
    readSource("lib/auth.ts"),
    readSource("lib/auth-client.ts"),
    readSource("app/api/auth/[...all]/route.ts"),
    readSource("lib/platform-auth-access.ts"),
    readSource("lib/platform-policy.ts"),
  ]);

  assert.match(auth, /admin\(\{/);
  assert.match(auth, /twoFactor\(\{/);
  assert.match(auth, /trustDeviceMaxAge: 0/);
  assert.match(auth, /context\?\.path !== "\/two-factor\/verify-totp"/);
  assert.match(
    auth,
    /existingSession && !existingSession\.platformAuthenticatedAt/,
  );
  assert.match(auth, /platformAuthenticatedAt: new Date\(\)/);
  assert.match(authClient, /twoFactorClient\(/);
  assert.doesNotMatch(authClient, /adminClient/);
  assert.match(authRoute, /blockedAdminPrefix = "\/api\/auth\/admin\/"/);
  assert.match(authRoute, /PLATFORM_TOTP_REQUIRED/);
  assert.match(authRoute, /platformAuthenticatedAt: new Date\(\)/);
  assert.match(
    authRoute,
    /existingSession\?\.session\.platformAuthenticatedAt/,
  );
  assert.match(access, /user: \["ban"\]/);
  assert.match(access, /session: \["revoke"\]/);
  for (const prohibited of [
    "impersonate",
    "set-password",
    "set-email",
    "delete",
    "create",
  ]) {
    assert.doesNotMatch(access, new RegExp(`\\["${prohibited}"\\]`));
  }
  assert.match(policy, /allowImpersonation: false/);
  assert.match(policy, /destructiveStepUpMaxAgeMs: 15 \* 60 \* 1_000/);
});

test("Phase 17A schema and migration contain the complete approved foundation", async () => {
  const [schema, migration, environment] = await Promise.all([
    readSource("prisma/schema.prisma"),
    readSource(
      "prisma/migrations/0014_phase17a_platform_foundation/migration.sql",
    ),
    readSource(".env.example"),
  ]);

  for (const model of [
    "TwoFactor",
    "PlatformRoleGrant",
    "PlatformAuditLog",
    "PlatformDeletionRequest",
    "PlatformQuotaDefault",
    "UserQuotaOverride",
    "BoothQuotaOverride",
    "StorageAsset",
    "StorageReconciliationRun",
  ]) {
    assert.match(schema, new RegExp(`model ${model}`));
  }
  assert.match(schema, /serviceState\s+BoothServiceState\s+@default\(ACTIVE\)/);
  assert.match(schema, /platformAuthenticatedAt\s+DateTime\?/);
  assert.match(migration, /PlatformAuditLog_append_only_update/);
  assert.match(migration, /PlatformAuditLog_append_only_delete/);
  assert.match(migration, /PlatformDeletionRequest_cooling_off_check/);
  assert.match(migration, /PlatformDeletionRequest_one_open_target_key/);
  assert.match(migration, /5368709120/);
  assert.match(environment, /PLATFORM_SUPER_ADMIN_USER_ID=""/);
});

test("Phase 17A exposes only account-security and TOTP challenge UI", async () => {
  const [challenge, settings, dashboard, dashboardStyles, signOut] =
    await Promise.all([
      readSource("components/auth/two-factor-form.tsx"),
      readSource("app/account/security/two-factor-settings.tsx"),
      readSource("app/dashboard/page.tsx"),
      readSource("app/dashboard/dashboard.module.css"),
      readSource("app/dashboard/sign-out-button.tsx"),
    ]);
  assert.match(challenge, /verifyTotp/);
  assert.match(challenge, /trustDevice: false/);
  assert.match(settings, /twoFactor\.enable/);
  assert.match(settings, /securityBackupTitle/);
  assert.match(dashboard, /href="\/account\/security"/);
  assert.match(dashboard, /aria-label=\{strings\.accountSecurity\}/);
  assert.match(signOut, /aria-label=\{pending \? strings\.signingOut/);
  assert.match(dashboardStyles, /\.securityLink span,/);
  assert.doesNotMatch(
    dashboardStyles,
    /\.accountName,\s*\n\s*\.securityLink,\s*\n\s*\.signOutButton span/,
  );
});
