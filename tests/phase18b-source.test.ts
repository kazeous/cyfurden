import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("Phase 18B keeps password replacement on the supported Better Auth client contract", async () => {
  const [form, auth, route] = await Promise.all([
    read("app/account/password-form.tsx"),
    read("lib/auth.ts"),
    read("app/api/auth/[...all]/route.ts"),
  ]);

  assert.match(form, /authClient\.changePassword\(/);
  assert.match(form, /revokeOtherSessions: true/);
  assert.match(auth, /context\.path === "\/change-password"/);
  assert.match(auth, /platformAuthenticatedAt: null/);
  assert.match(auth, /INVALID_ACCOUNT_PASSWORD_REPLACEMENT/);
  assert.match(route, /passwordChangePath/);
  assert.match(route, /ACCOUNT_UNAVAILABLE/);
  assert.match(route, /Cache-Control[\s\S]*no-store/);
});

test("Phase 18B email replacement is self-scoped, transactional, and revokes every session", async () => {
  const [service, plugin, route] = await Promise.all([
    read("lib/account-credentials.ts"),
    read("lib/account-auth-plugin.ts"),
    read("app/api/auth/[...all]/route.ts"),
  ]);

  assert.match(service, /runSerializableTransaction/);
  assert.match(service, /providerId: "credential"/);
  assert.match(service, /verifyPassword\(/);
  assert.match(service, /createOTP\(/);
  assert.match(service, /backupCodes\.filter/);
  assert.match(service, /emailVerified: false/);
  assert.match(
    service,
    /session\.deleteMany\(\{ where: \{ userId: user\.id \} \}\)/,
  );
  assert.doesNotMatch(service, /teamInvitation\.(update|delete)/);
  assert.match(plugin, /sensitiveSessionMiddleware/);
  assert.match(plugin, /deleteSessionCookie\(context\)/);
  assert.match(plugin, /ACCOUNT_EMAIL_CHANGE_FAILED/);
  assert.match(route, /emailChangePath/);
});

test("Phase 18B exposes credential-only bilingual forms with bounded accessible inputs", async () => {
  const [page, email, password, strings, account] = await Promise.all([
    read("app/account/page.tsx"),
    read("app/account/email-form.tsx"),
    read("app/account/password-form.tsx"),
    read("lib/i18n/account.ts"),
    read("lib/account.ts"),
  ]);

  assert.match(page, /account\.credentialEnabled \? \(/);
  assert.match(page, /twoFactorRequired=\{account\.twoFactorEnabled\}/);
  assert.match(email, /aria-invalid/);
  assert.match(email, /disabled=\{pending\}/);
  assert.match(
    email,
    /window\.location\.replace\("\/sign-in\?notice=email-changed"\)/,
  );
  assert.match(password, /autoComplete="current-password"/);
  assert.match(password, /autoComplete="new-password"/);
  assert.match(strings, /changeEmail: "Change email"/);
  assert.match(strings, /changePassword: "Đổi mật khẩu"/);
  assert.match(account, /password: \{ not: null \}/);
  assert.doesNotMatch(page, /passwordHash|backupCodes|session\.token/);
});
