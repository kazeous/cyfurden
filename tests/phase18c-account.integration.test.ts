import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createOTP } from "@better-auth/utils/otp";

const enabled = process.env.CYFURDEN_PHASE18_INTEGRATION === "1";

async function expectTotpFailure(
  operation: () => Promise<unknown>,
  expectedCode: string,
) {
  await assert.rejects(operation, (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === expectedCode
    );
  });
}

function readSessionCookie(response: Response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";", 1)[0];
}

test(
  "Phase 18C enrolls and resynchronizes without exposing the enabled factor",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, totp, { auth }, authRoute] = await Promise.all([
      import("../lib/db"),
      import("better-auth/crypto"),
      import("../lib/account-totp"),
      import("../lib/auth"),
      import("../app/api/auth/[...all]/route"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18c-main-${suffix}`;
    const otherUserId = `phase18c-other-${suffix}`;
    const password = "Current-password-18C";
    const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

    const signIn = async (email: string) => {
      const response = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email, password }),
        }),
      );
      assert.equal(response.ok, true);
      const cookie = readSessionCookie(response);
      assert.ok(cookie);
      return cookie;
    };

    const verifyFactor = (
      cookie: string,
      path: "verify-totp" | "verify-backup-code",
      code: string,
      lifecycle = false,
    ) =>
      authRoute.POST(
        new Request(`${origin}/api/auth/two-factor/${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: origin,
            ...(lifecycle
              ? {
                  "x-cyfurden-factor-purpose": "account-totp-lifecycle",
                }
              : {}),
          },
          body: JSON.stringify({ code, trustDevice: false }),
        }),
      );

    try {
      const passwordHash = await crypto.hashPassword(password);
      await db.user.createMany({
        data: [
          {
            id: userId,
            name: "Phase 18C Main",
            email: `${userId}@example.com`,
            emailVerified: true,
          },
          {
            id: otherUserId,
            name: "Phase 18C Other",
            email: `${otherUserId}@example.com`,
            emailVerified: true,
          },
        ],
      });
      await db.account.createMany({
        data: [
          {
            id: `phase18c-account-${suffix}`,
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
          },
          {
            id: `phase18c-other-account-${suffix}`,
            accountId: otherUserId,
            providerId: "credential",
            userId: otherUserId,
            password: passwordHash,
          },
        ],
      });
      const [cookie, otherCookie] = await Promise.all([
        signIn(`${userId}@example.com`),
        signIn(`${otherUserId}@example.com`),
      ]);
      const [session, otherSession] = await Promise.all([
        db.session.findFirstOrThrow({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
        db.session.findFirstOrThrow({
          where: { userId: otherUserId },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const sessionInput = {
        userId,
        sessionId: session.id,
        sessionToken: session.token,
      };

      await expectTotpFailure(
        () =>
          totp.beginAccountTotpChange({
            ...sessionInput,
            currentPassword: "wrong-password",
            purpose: "enable",
          }),
        "AUTHENTICATION_FAILED",
      );
      const firstSetup = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: password,
        purpose: "enable",
      });
      const identifier = totp.accountTotpInternals.challengeIdentifier(
        userId,
        session.id,
      );
      const pending = await db.verification.findFirstOrThrow({
        where: { identifier },
      });
      assert.equal(pending.value.includes(firstSetup.setupKey), false);
      assert.match(
        await crypto.symmetricDecrypt({
          data: pending.value,
          key: totp.cyfurdenAuthSecret,
        }),
        /"kind":"account-totp-challenge"/,
      );
      assert.equal(await db.twoFactor.count({ where: { userId } }), 0);

      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({
            userId: otherUserId,
            sessionId: otherSession.id,
            sessionToken: otherSession.token,
            code: "123456",
          }),
        "CHALLENGE_INVALID",
      );
      await expectTotpFailure(
        () => totp.confirmAccountTotpChange({ ...sessionInput, code: "12x" }),
        "INVALID_INPUT",
      );
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({ ...sessionInput, code: "000000" }),
        "AUTHENTICATION_FAILED",
      );
      assert.equal(await db.twoFactor.count({ where: { userId } }), 0);

      await db.verification.updateMany({
        where: { identifier },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      const expiredCode = await createOTP(firstSetup.setupKey).totp();
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({
            ...sessionInput,
            code: expiredCode,
          }),
        "CHALLENGE_INVALID",
      );

      const abandonedSetup = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: password,
        purpose: "enable",
      });
      let finalSetup = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: password,
        purpose: "enable",
      });
      const abandonedCode = await createOTP(abandonedSetup.setupKey).totp();
      let finalCode = await createOTP(finalSetup.setupKey).totp();
      while (finalCode === abandonedCode) {
        finalSetup = await totp.beginAccountTotpChange({
          ...sessionInput,
          currentPassword: password,
          purpose: "enable",
        });
        finalCode = await createOTP(finalSetup.setupKey).totp();
      }
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({
            ...sessionInput,
            code: abandonedCode,
          }),
        "AUTHENTICATION_FAILED",
      );
      const enrolled = await totp.confirmAccountTotpChange({
        ...sessionInput,
        code: finalCode,
      });
      assert.equal(enrolled.purpose, "enable");
      assert.equal(enrolled.recoveryCodes.length, 10);
      assert.equal(new Set(enrolled.recoveryCodes).size, 10);
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({ ...sessionInput, code: finalCode }),
        "CHALLENGE_INVALID",
      );

      const firstFactor = await db.twoFactor.findUniqueOrThrow({
        where: { userId },
      });
      assert.equal(
        await crypto.symmetricDecrypt({
          data: firstFactor.secret,
          key: totp.cyfurdenAuthSecret,
        }),
        finalSetup.setupKey,
      );
      assert.equal(
        totp.accountBackupCodesAreEncrypted(firstFactor.backupCodes),
        true,
      );
      assert.equal(
        firstFactor.backupCodes.includes(enrolled.recoveryCodes[0]!),
        false,
      );

      await db.platformRoleGrant.create({
        data: {
          userId,
          role: "PLATFORM_VIEWER",
          grantedByUserId: userId,
          grantReason: "Phase 18C resync acceptance",
        },
      });
      const originalStepUp = new Date("2026-08-19T01:00:00.000Z");
      await db.session.update({
        where: { id: session.id },
        data: { platformAuthenticatedAt: originalStepUp },
      });
      await db.session.create({
        data: {
          id: `phase18c-other-session-${suffix}`,
          token: `phase18c-other-token-${suffix}`,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
      });
      const oldCode = await createOTP(finalSetup.setupKey).totp();
      const proofResponse = await verifyFactor(
        cookie,
        "verify-totp",
        oldCode,
        true,
      );
      assert.equal(proofResponse.ok, true);
      assert.equal(proofResponse.headers.get("cache-control"), "no-store");
      assert.equal(
        (
          await db.session.findUniqueOrThrow({ where: { id: session.id } })
        ).platformAuthenticatedAt?.toISOString(),
        originalStepUp.toISOString(),
      );

      let replacement = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: password,
        purpose: "resync",
      });
      let replacementCode = await createOTP(replacement.setupKey).totp();
      if (replacementCode === oldCode) {
        await totp.recordAccountTotpFactorProof({
          userId,
          sessionId: session.id,
        });
        replacement = await totp.beginAccountTotpChange({
          ...sessionInput,
          currentPassword: password,
          purpose: "resync",
        });
        replacementCode = await createOTP(replacement.setupKey).totp();
      }
      assert.notEqual(replacementCode, oldCode);
      assert.equal(
        await crypto.symmetricDecrypt({
          data: (await db.twoFactor.findUniqueOrThrow({ where: { userId } }))
            .secret,
          key: totp.cyfurdenAuthSecret,
        }),
        finalSetup.setupKey,
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", oldCode)).ok,
        true,
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", replacementCode)).ok,
        false,
      );
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({
            ...sessionInput,
            code: "000000",
          }),
        "AUTHENTICATION_FAILED",
      );
      assert.equal(
        await crypto.symmetricDecrypt({
          data: (await db.twoFactor.findUniqueOrThrow({ where: { userId } }))
            .secret,
          key: totp.cyfurdenAuthSecret,
        }),
        finalSetup.setupKey,
      );

      const rotated = await totp.confirmAccountTotpChange({
        ...sessionInput,
        code: replacementCode,
      });
      assert.equal(rotated.purpose, "resync");
      assert.equal(await db.session.count({ where: { userId } }), 1);
      assert.equal(
        (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
          .platformAuthenticatedAt,
        null,
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", oldCode)).ok,
        false,
      );
      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            enrolled.recoveryCodes[1]!,
          )
        ).ok,
        false,
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", replacementCode)).ok,
        true,
      );
      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            rotated.recoveryCodes[0]!,
          )
        ).ok,
        true,
      );
      const remainingCodes = JSON.parse(
        await totp.decryptAccountBackupCodes(
          (await db.twoFactor.findUniqueOrThrow({ where: { userId } }))
            .backupCodes,
        ),
      ) as string[];
      assert.equal(remainingCodes.includes(rotated.recoveryCodes[0]!), false);

      const platformRefresh = await verifyFactor(
        cookie,
        "verify-totp",
        replacementCode,
      );
      assert.equal(platformRefresh.ok, true);
      assert.ok(
        (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
          .platformAuthenticatedAt,
      );

      const otherAbandoned = await totp.beginAccountTotpChange({
        userId: otherUserId,
        sessionId: otherSession.id,
        sessionToken: otherSession.token,
        currentPassword: password,
        purpose: "enable",
      });
      await totp.cancelAccountTotpChange({
        userId: otherUserId,
        sessionId: otherSession.id,
        sessionToken: otherSession.token,
      });
      const cancelledCode = await createOTP(otherAbandoned.setupKey).totp();
      await expectTotpFailure(
        () =>
          totp.confirmAccountTotpChange({
            userId: otherUserId,
            sessionId: otherSession.id,
            sessionToken: otherSession.token,
            code: cancelledCode,
          }),
        "CHALLENGE_INVALID",
      );
      assert.ok(otherCookie);
    } finally {
      await db.verification.deleteMany({
        where: { identifier: { contains: suffix } },
      });
      await db.user.deleteMany({
        where: { id: { in: [userId, otherUserId] } },
      });
      await db.$disconnect();
    }
  },
);

test(
  "Phase 18C disables only after destructive confirmation and denies platform grants",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, totp, { auth }, authRoute] = await Promise.all([
      import("../lib/db"),
      import("better-auth/crypto"),
      import("../lib/account-totp"),
      import("../lib/auth"),
      import("../app/api/auth/[...all]/route"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18c-disable-${suffix}`;
    const email = `${userId}@example.com`;
    const password = "Current-password-18C";
    const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase 18C Disable",
          email,
          emailVerified: true,
          accounts: {
            create: {
              id: `phase18c-disable-account-${suffix}`,
              accountId: userId,
              providerId: "credential",
              password: await crypto.hashPassword(password),
            },
          },
        },
      });
      const signIn = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email, password }),
        }),
      );
      assert.equal(signIn.ok, true);
      const cookie = readSessionCookie(signIn);
      assert.ok(cookie);
      const session = await db.session.findFirstOrThrow({ where: { userId } });
      const sessionInput = {
        userId,
        sessionId: session.id,
        sessionToken: session.token,
      };
      const setup = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: password,
        purpose: "enable",
      });
      await totp.confirmAccountTotpChange({
        ...sessionInput,
        code: await createOTP(setup.setupKey).totp(),
      });
      const currentCode = await createOTP(setup.setupKey).totp();
      await db.session.update({
        where: { id: session.id },
        data: { platformAuthenticatedAt: new Date() },
      });
      await db.session.create({
        data: {
          id: `phase18c-disable-other-session-${suffix}`,
          token: `phase18c-disable-other-token-${suffix}`,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
      });

      await expectTotpFailure(
        () =>
          totp.disableAccountTotp({
            ...sessionInput,
            currentPassword: password,
            currentFactorCode: currentCode,
            confirmDisable: true,
          }),
        "AUTHENTICATION_FAILED",
      );
      await expectTotpFailure(
        () =>
          totp.disableAccountTotp({
            ...sessionInput,
            currentPassword: password,
            currentFactorCode: currentCode,
            confirmDisable: false,
          }),
        "INVALID_INPUT",
      );

      const proof = await authRoute.POST(
        new Request(`${origin}/api/auth/two-factor/verify-totp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: origin,
            "x-cyfurden-factor-purpose": "account-totp-lifecycle",
          },
          body: JSON.stringify({ code: currentCode, trustDevice: false }),
        }),
      );
      assert.equal(proof.ok, true);

      await db.platformRoleGrant.create({
        data: {
          userId,
          role: "PLATFORM_VIEWER",
          grantedByUserId: userId,
          grantReason: "Phase 18C disable denial",
        },
      });
      await expectTotpFailure(
        () =>
          totp.disableAccountTotp({
            ...sessionInput,
            currentPassword: password,
            currentFactorCode: currentCode,
            confirmDisable: true,
          }),
        "PLATFORM_TOTP_REQUIRED",
      );
      const nativeDenied = await authRoute.POST(
        new Request(`${origin}/api/auth/two-factor/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: origin,
          },
          body: JSON.stringify({ password }),
        }),
      );
      assert.equal(nativeDenied.status, 403);
      assert.equal(
        ((await nativeDenied.json()) as { code?: string }).code,
        "PLATFORM_TOTP_REQUIRED",
      );
      assert.equal(await db.twoFactor.count({ where: { userId } }), 1);

      await db.platformRoleGrant.delete({ where: { userId } });
      const nativeHidden = await authRoute.POST(
        new Request(`${origin}/api/auth/two-factor/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            Origin: origin,
          },
          body: JSON.stringify({ password }),
        }),
      );
      assert.equal(nativeHidden.status, 404);
      await expectTotpFailure(
        () =>
          totp.disableAccountTotp({
            ...sessionInput,
            currentPassword: "wrong-password",
            currentFactorCode: currentCode,
            confirmDisable: true,
          }),
        "AUTHENTICATION_FAILED",
      );
      assert.equal(await db.twoFactor.count({ where: { userId } }), 1);

      assert.deepEqual(
        await totp.disableAccountTotp({
          ...sessionInput,
          currentPassword: password,
          currentFactorCode: currentCode,
          confirmDisable: true,
        }),
        { status: true },
      );
      const [user, factorCount, sessions, currentSession, records] =
        await Promise.all([
          db.user.findUniqueOrThrow({ where: { id: userId } }),
          db.twoFactor.count({ where: { userId } }),
          db.session.count({ where: { userId } }),
          db.session.findUniqueOrThrow({ where: { id: session.id } }),
          db.verification.count({
            where: { identifier: { contains: userId } },
          }),
        ]);
      assert.equal(user.twoFactorEnabled, false);
      assert.equal(factorCount, 0);
      assert.equal(sessions, 1);
      assert.equal(currentSession.platformAuthenticatedAt, null);
      assert.equal(records, 0);
    } finally {
      await db.verification.deleteMany({
        where: { identifier: { contains: suffix } },
      });
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
  },
);
