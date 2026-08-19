import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("Phase 18C stages encrypted user-and-session-bound TOTP changes", async () => {
  const [service, plugin, schema] = await Promise.all([
    read("lib/account-totp.ts"),
    read("lib/account-totp-plugin.ts"),
    read("prisma/schema.prisma"),
  ]);

  assert.match(service, /cyfurden:account-totp-challenge:/);
  assert.match(service, /symmetricEncrypt/);
  assert.match(service, /expiresAt: \{ gt: now \}/);
  assert.match(service, /runSerializableTransaction/);
  assert.match(service, /consumed\.count !== 1/);
  assert.match(service, /payload\.purpose === "resync"/);
  assert.match(plugin, /sensitiveSessionMiddleware/);
  assert.match(plugin, /Cache-Control": "no-store"/);
  assert.match(plugin, /path\.startsWith\("\/account\/totp\/"\)/);
  assert.match(schema, /model Verification/);
});

test("Phase 18C keeps the old factor until confirmation and rotates atomically", async () => {
  const service = await read("lib/account-totp.ts");

  const beginStart = service.indexOf(
    "export async function beginAccountTotpChange",
  );
  const confirmStart = service.indexOf(
    "export async function confirmAccountTotpChange",
  );
  const beginSource = service.slice(beginStart, confirmStart);
  const confirmSource = service.slice(confirmStart);
  assert.doesNotMatch(beginSource, /twoFactor\.(?:upsert|update|delete)/);
  assert.match(confirmSource, /transaction\.twoFactor\.upsert/);
  assert.match(confirmSource, /backupCodes/);
  assert.match(confirmSource, /session\.deleteMany/);
  assert.match(confirmSource, /platformAuthenticatedAt: null/);
});

test("Phase 18C exposes account controls while hiding native lifecycle bypasses", async () => {
  const [page, controls, route, auth, strings] = await Promise.all([
    read("app/account/page.tsx"),
    read("app/account/security/two-factor-settings.tsx"),
    read("app/api/auth/[...all]/route.ts"),
    read("lib/auth.ts"),
    read("lib/i18n/account.ts"),
  ]);

  assert.match(page, /<TwoFactorSettings/);
  assert.match(controls, /\/account\/totp\/begin/);
  assert.match(controls, /\/account\/totp\/confirm/);
  assert.match(controls, /\/account\/totp\/disable/);
  assert.match(controls, /verify-backup-code/);
  assert.match(controls, /router\.push\(returnTo\)/);
  assert.match(controls, /aria-invalid/);
  assert.match(route, /blockedTotpMutationPaths/);
  assert.match(route, /account-totp-lifecycle/);
  assert.match(route, /recordAccountTotpFactorProof/);
  assert.match(route, /PLATFORM_TOTP_REQUIRED/);
  assert.match(auth, /storeBackupCodes:/);
  assert.match(strings, /Replace the authenticator/);
  assert.match(strings, /Thay ứng dụng xác thực/);
  assert.doesNotMatch(controls, /twoFactor\.enable|twoFactor\.disable/);
});

test("Phase 18C preserves the complete validated platform return target", async () => {
  const securityPage = await read("app/account/security/page.tsx");
  assert.match(securityPage, /\^\\\/admin\(\?:\\\/\|\$\)/);
  assert.match(
    securityPage,
    /`\$\{parsed\.pathname\}\$\{parsed\.search\}\$\{parsed\.hash\}`/,
  );
});
