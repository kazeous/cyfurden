import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("Phase 18D keeps the complete account acceptance suite in the standard gate", async () => {
  const packageJson = await read("package.json");
  for (const file of [
    "tests/account-profile.test.ts",
    "tests/account-security-return.test.ts",
    "tests/account-credentials.test.ts",
    "tests/account-totp.test.ts",
    "tests/phase18a-source.test.ts",
    "tests/phase18b-source.test.ts",
    "tests/phase18c-source.test.ts",
    "tests/phase18d-source.test.ts",
    "tests/phase18b-account.integration.test.ts",
    "tests/phase18c-account.integration.test.ts",
    "tests/phase18d-account.integration.test.ts",
  ]) {
    assert.match(packageJson, new RegExp(file.replaceAll(".", "\\.")));
  }
});

test("Phase 18D source contracts cover localized provider states without stored secrets", async () => {
  const [page, account, strings, profile, credentials, settings] =
    await Promise.all([
      read("app/account/page.tsx"),
      read("lib/account.ts"),
      read("lib/i18n/account.ts"),
      read("lib/account-profile.ts"),
      read("lib/account-credentials-validation.ts"),
      read("app/account/security/two-factor-settings.tsx"),
    ]);

  assert.match(
    profile,
    /normalize\("NFC"\)[\s\S]*replace\(\/\\s\+\/gu, " "\)\.trim\(\)/,
  );
  assert.match(credentials, /normalizeAccountEmail/);
  assert.match(strings, /emailReadOnly:\s+"This sign-in email is managed by/);
  assert.match(strings, /emailReadOnly:\s+"Email đăng nhập này do/);
  assert.match(strings, /nameLength: "Use between 2 and 80 visible characters/);
  assert.match(strings, /nameLength: "Dùng từ 2 đến 80 ký tự hiển thị/);
  assert.match(page, /account\.credentialEnabled \? \(/);
  assert.match(page, /strings\.passwordProviderOwned/);
  assert.match(settings, /!credentialEnabled/);
  assert.doesNotMatch(account, /password: true|secret: true|backupCodes: true/);
  assert.doesNotMatch(page, /passwordHash|backupCodes|totpURI|session\.token/);
  assert.doesNotMatch(
    `${page}\n${account}\n${settings}`,
    /console\.(?:log|debug|info|warn|error)/,
  );
});

test("Phase 18D keeps the active-platform disable guard ahead of factor removal", async () => {
  const [service, settings] = await Promise.all([
    read("lib/account-totp.ts"),
    read("app/account/security/two-factor-settings.tsx"),
  ]);
  const disableStart = service.indexOf(
    "export async function disableAccountTotp",
  );
  const cancelStart = service.indexOf(
    "export async function cancelAccountTotpChange",
  );
  const disable = service.slice(disableStart, cancelStart);

  assert.ok(disableStart >= 0 && cancelStart > disableStart);
  assert.match(disable, /status: "ACTIVE"/);
  assert.match(disable, /PLATFORM_TOTP_REQUIRED/);
  assert.ok(
    disable.indexOf("PLATFORM_TOTP_REQUIRED") <
      disable.indexOf("twoFactor.deleteMany"),
  );
  assert.match(settings, /platformGrantActive \? \(/);
  assert.match(settings, /twoFactorPlatformConstraint/);
});
