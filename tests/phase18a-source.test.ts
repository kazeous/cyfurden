import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("Phase 18A account page is dynamic, authenticated, and self-scoped", async () => {
  const [page, accountRead] = await Promise.all([
    read("app/account/page.tsx"),
    read("lib/account.ts"),
  ]);

  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /requireUser\("\/account"\)/);
  assert.match(page, /readCurrentAccount\(session\.user\.id\)/);
  assert.match(accountRead, /where: \{ id: currentUserId \}/);
  assert.match(accountRead, /providerId: true/);
  assert.match(accountRead, /twoFactorEnabled: true/);
  assert.match(accountRead, /platformRoleGrant:/);
  assert.doesNotMatch(accountRead, /password: true/);
});

test("Phase 18A uses one shared client and server display-name contract", async () => {
  const [auth, form, profile] = await Promise.all([
    read("lib/auth.ts"),
    read("app/account/profile-form.tsx"),
    read("lib/account-profile.ts"),
  ]);

  assert.match(auth, /context\.path !== "\/update-user"/);
  assert.match(auth, /validateAccountDisplayName\(context\.body\.name\)/);
  assert.match(auth, /context\.body\.name = result\.value/);
  assert.match(form, /validateAccountDisplayName\(name\)/);
  assert.match(form, /authClient\.updateUser\(\{ name: result\.value \}\)/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(profile, /replace\(\/\\s\+\/gu, " "\)\.trim\(\)/);
});

test("Phase 18A points ordinary shell links at account while retaining exact platform step-up", async () => {
  const [dashboard, adminMenu, platformShell, platformMenu, stepUp, security] =
    await Promise.all([
      read("app/dashboard/page.tsx"),
      read("components/admin/admin-overflow-menu.tsx"),
      read("components/platform-admin/platform-admin-shell.tsx"),
      read("components/platform-admin/platform-admin-controls.tsx"),
      read("components/platform-admin/platform-lifecycle-controls.tsx"),
      read("app/account/security/page.tsx"),
    ]);

  assert.match(dashboard, /href="\/account"/);
  assert.match(adminMenu, /href="\/account"/);
  assert.match(adminMenu, /\{userLabel\}/);
  assert.match(platformShell, /href="\/account"/);
  assert.match(platformMenu, /href="\/account"/);
  assert.match(stepUp, /`\/account\/security\?returnTo=\$\{/);
  assert.match(security, /normalizePlatformSecurityReturnTo/);
  assert.match(security, /returnTo=\{returnTo\}/);
  assert.match(security, /returnTo \? t\.securityBackPlatform/);
  assert.match(security, /"\/account#two-factor"/);
});

test("Phase 18A renders four bilingual sections without credential secrets", async () => {
  const [page, strings] = await Promise.all([
    read("app/account/page.tsx"),
    read("lib/i18n/account.ts"),
  ]);

  for (const id of ["profile", "email", "password", "two-factor"]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.match(strings, /pageTitle: "Your account"/);
  assert.match(strings, /pageTitle: "Tài khoản của bạn"/);
  assert.doesNotMatch(page, /passwordHash|backupCodes|totpURI|session\.token/);
});
