import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createOTP } from "@better-auth/utils/otp";

const enabled = process.env.CYFURDEN_PHASE18_INTEGRATION === "1";

function readSessionCookie(response: Response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .find((cookie) => cookie.startsWith("better-auth.session_token="))
    ?.split(";", 1)[0];
}

async function expectAccountFailure(
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

test(
  "Phase 18D persists a normalized profile name in the authenticated session",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, { auth }] = await Promise.all([
      import("../lib/db"),
      import("better-auth/crypto"),
      import("../lib/auth"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18d-profile-${suffix}`;
    const email = `${userId}@example.com`;
    const password = "Phase-18D-profile-password";
    const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase 18D Profile",
          email,
          emailVerified: true,
          accounts: {
            create: {
              id: `phase18d-profile-account-${suffix}`,
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
      const sessionCookie = readSessionCookie(signIn);
      assert.ok(sessionCookie);

      const invalid = await auth.handler(
        new Request(`${origin}/api/auth/update-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: origin,
          },
          body: JSON.stringify({ name: "A" }),
        }),
      );
      assert.equal(invalid.ok, false);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).name,
        "Phase 18D Profile",
      );

      const update = await auth.handler(
        new Request(`${origin}/api/auth/update-user`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: origin,
          },
          body: JSON.stringify({ name: "  Mai\t  An \n" }),
        }),
      );
      assert.equal(update.ok, true);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).name,
        "Mai An",
      );

      const session = await auth.handler(
        new Request(`${origin}/api/auth/get-session`, {
          headers: { Cookie: sessionCookie, Origin: origin },
        }),
      );
      assert.equal(session.ok, true);
      assert.equal(
        ((await session.json()) as { user?: { name?: string } }).user?.name,
        "Mai An",
      );
    } finally {
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
  },
);

test(
  "Phase 18D exercises the complete credential and authenticator lifecycle",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, credentials, totp, { auth }, authRoute] =
      await Promise.all([
        import("../lib/db"),
        import("better-auth/crypto"),
        import("../lib/account-credentials"),
        import("../lib/account-totp"),
        import("../lib/auth"),
        import("../app/api/auth/[...all]/route"),
      ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18d-lifecycle-${suffix}`;
    const otherUserId = `phase18d-other-${suffix}`;
    const collisionId = `phase18d-collision-${suffix}`;
    const oldEmail = `${userId}@example.com`;
    const newEmail = `phase18d-replacement-${suffix}@example.com`;
    const collisionEmail = `phase18d-taken-${suffix}@example.com`;
    const currentPassword = "Phase-18D-current-password";
    const replacementPassword = "Phase-18D-replacement-password";
    const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

    const signIn = (email: string, password: string) =>
      auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email, password }),
        }),
      );
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
              ? { "x-cyfurden-factor-purpose": "account-totp-lifecycle" }
              : {}),
          },
          body: JSON.stringify({ code, trustDevice: false }),
        }),
      );

    try {
      const passwordHash = await crypto.hashPassword(currentPassword);
      await db.user.createMany({
        data: [
          {
            id: userId,
            name: "Phase 18D Lifecycle",
            email: oldEmail,
            emailVerified: true,
          },
          {
            id: otherUserId,
            name: "Phase 18D Other",
            email: `${otherUserId}@example.com`,
            emailVerified: true,
          },
          {
            id: collisionId,
            name: "Phase 18D Collision",
            email: collisionEmail,
            emailVerified: true,
          },
        ],
      });
      await db.account.createMany({
        data: [
          {
            id: `phase18d-account-${suffix}`,
            accountId: userId,
            providerId: "credential",
            userId,
            password: passwordHash,
          },
          {
            id: `phase18d-other-account-${suffix}`,
            accountId: otherUserId,
            providerId: "credential",
            userId: otherUserId,
            password: passwordHash,
          },
        ],
      });
      await db.session.create({
        data: {
          id: `phase18d-prior-session-${suffix}`,
          token: `phase18d-prior-token-${suffix}`,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          platformAuthenticatedAt: new Date(),
        },
      });

      const initialSignIn = await signIn(oldEmail, currentPassword);
      assert.equal(initialSignIn.ok, true);
      const initialCookie = readSessionCookie(initialSignIn);
      assert.ok(initialCookie);
      assert.equal(await db.session.count({ where: { userId } }), 2);

      const wrongPasswordChange = await auth.handler(
        new Request(`${origin}/api/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: initialCookie,
            Origin: origin,
          },
          body: JSON.stringify({
            currentPassword: "wrong-password",
            newPassword: replacementPassword,
            revokeOtherSessions: true,
          }),
        }),
      );
      assert.equal(wrongPasswordChange.ok, false);
      assert.equal(await db.session.count({ where: { userId } }), 2);

      const passwordChange = await auth.handler(
        new Request(`${origin}/api/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: initialCookie,
            Origin: origin,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword: replacementPassword,
            revokeOtherSessions: true,
          }),
        }),
      );
      assert.equal(passwordChange.ok, true);
      const rotatedSessions = await db.session.findMany({ where: { userId } });
      assert.equal(rotatedSessions.length, 1);
      assert.equal(rotatedSessions[0]?.platformAuthenticatedAt, null);
      assert.equal((await signIn(oldEmail, currentPassword)).ok, false);

      const replacementSignIn = await signIn(oldEmail, replacementPassword);
      assert.equal(replacementSignIn.ok, true);
      const replacementCookie = readSessionCookie(replacementSignIn);
      assert.ok(replacementCookie);
      const replacementSession = await db.session.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      const emailInput = {
        userId,
        sessionId: replacementSession.id,
        sessionToken: replacementSession.token,
        currentEmail: oldEmail,
        newEmail: collisionEmail,
        confirmationEmail: collisionEmail,
        currentPassword: replacementPassword,
        secondFactorCode: "",
        twoFactorRequired: false,
        secret: process.env.BETTER_AUTH_SECRET ?? "phase18d-integration-secret",
      };
      await expectAccountFailure(
        () => credentials.changeCurrentAccountEmail(emailInput),
        "EMAIL_UNAVAILABLE",
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
        oldEmail,
      );
      await credentials.changeCurrentAccountEmail({
        ...emailInput,
        newEmail: newEmail.toUpperCase(),
        confirmationEmail: newEmail,
      });
      assert.equal(await db.session.count({ where: { userId } }), 0);
      assert.equal((await signIn(oldEmail, replacementPassword)).ok, false);

      const newEmailSignIn = await signIn(newEmail, replacementPassword);
      assert.equal(newEmailSignIn.ok, true);
      const cookie = readSessionCookie(newEmailSignIn);
      assert.ok(cookie);
      const session = await db.session.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      const otherSignIn = await signIn(
        `${otherUserId}@example.com`,
        currentPassword,
      );
      assert.equal(otherSignIn.ok, true);
      const otherSession = await db.session.findFirstOrThrow({
        where: { userId: otherUserId },
        orderBy: { createdAt: "desc" },
      });
      const sessionInput = {
        userId,
        sessionId: session.id,
        sessionToken: session.token,
      };

      const setup = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: replacementPassword,
        purpose: "enable",
      });
      const setupCode = await createOTP(setup.setupKey).totp();
      await expectAccountFailure(
        () =>
          totp.confirmAccountTotpChange({
            userId: otherUserId,
            sessionId: otherSession.id,
            sessionToken: otherSession.token,
            code: setupCode,
          }),
        "CHALLENGE_INVALID",
      );
      const enrolled = await totp.confirmAccountTotpChange({
        ...sessionInput,
        code: setupCode,
      });
      assert.equal(enrolled.recoveryCodes.length, 10);
      await expectAccountFailure(
        () =>
          totp.confirmAccountTotpChange({ ...sessionInput, code: setupCode }),
        "CHALLENGE_INVALID",
      );

      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            enrolled.recoveryCodes[0]!,
          )
        ).ok,
        true,
      );
      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            enrolled.recoveryCodes[0]!,
          )
        ).ok,
        false,
      );

      const currentCode = await createOTP(setup.setupKey).totp();
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", currentCode, true)).ok,
        true,
      );
      const abandoned = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: replacementPassword,
        purpose: "resync",
      });
      await totp.cancelAccountTotpChange(sessionInput);
      const abandonedCode = await createOTP(abandoned.setupKey).totp();
      await expectAccountFailure(
        () =>
          totp.confirmAccountTotpChange({
            ...sessionInput,
            code: abandonedCode,
          }),
        "CHALLENGE_INVALID",
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", currentCode, true)).ok,
        true,
      );

      let replacement = await totp.beginAccountTotpChange({
        ...sessionInput,
        currentPassword: replacementPassword,
        purpose: "resync",
      });
      let replacementCode = await createOTP(replacement.setupKey).totp();
      while (replacementCode === currentCode) {
        await totp.cancelAccountTotpChange(sessionInput);
        assert.equal(
          (await verifyFactor(cookie, "verify-totp", currentCode, true)).ok,
          true,
        );
        replacement = await totp.beginAccountTotpChange({
          ...sessionInput,
          currentPassword: replacementPassword,
          purpose: "resync",
        });
        replacementCode = await createOTP(replacement.setupKey).totp();
      }
      await expectAccountFailure(
        () =>
          totp.confirmAccountTotpChange({ ...sessionInput, code: "000000" }),
        "AUTHENTICATION_FAILED",
      );
      assert.equal(
        await crypto.symmetricDecrypt({
          data: (await db.twoFactor.findUniqueOrThrow({ where: { userId } }))
            .secret,
          key: totp.cyfurdenAuthSecret,
        }),
        setup.setupKey,
      );
      await db.session.update({
        where: { id: session.id },
        data: { platformAuthenticatedAt: new Date() },
      });
      await db.session.create({
        data: {
          id: `phase18d-stale-session-${suffix}`,
          token: `phase18d-stale-token-${suffix}`,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
        },
      });
      const resynced = await totp.confirmAccountTotpChange({
        ...sessionInput,
        code: replacementCode,
      });
      assert.equal(resynced.purpose, "resync");
      assert.equal(await db.session.count({ where: { userId } }), 1);
      assert.equal(
        (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
          .platformAuthenticatedAt,
        null,
      );
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", currentCode)).ok,
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
            enrolled.recoveryCodes[1]!,
          )
        ).ok,
        false,
      );
      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            resynced.recoveryCodes[0]!,
          )
        ).ok,
        true,
      );
      assert.equal(
        (
          await verifyFactor(
            cookie,
            "verify-backup-code",
            resynced.recoveryCodes[0]!,
          )
        ).ok,
        false,
      );

      await db.user.update({
        where: { id: userId },
        data: { role: "PLATFORM_VIEWER" },
      });
      await db.platformRoleGrant.create({
        data: {
          userId,
          role: "PLATFORM_VIEWER",
          grantedByUserId: userId,
          grantReason: "Phase 18D lifecycle guard",
        },
      });
      assert.equal(
        (await verifyFactor(cookie, "verify-totp", replacementCode, true)).ok,
        true,
      );
      await expectAccountFailure(
        () =>
          totp.disableAccountTotp({
            ...sessionInput,
            currentPassword: replacementPassword,
            currentFactorCode: replacementCode,
            confirmDisable: true,
          }),
        "PLATFORM_TOTP_REQUIRED",
      );
      await db.platformRoleGrant.delete({ where: { userId } });
      await db.user.update({ where: { id: userId }, data: { role: "user" } });
      await totp.disableAccountTotp({
        ...sessionInput,
        currentPassword: replacementPassword,
        currentFactorCode: replacementCode,
        confirmDisable: true,
      });
      assert.equal(await db.twoFactor.count({ where: { userId } }), 0);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } }))
          .twoFactorEnabled,
        false,
      );
    } finally {
      await db.verification.deleteMany({
        where: { identifier: { contains: suffix } },
      });
      await db.user.deleteMany({
        where: { id: { in: [userId, otherUserId, collisionId] } },
      });
      await db.$disconnect();
    }
  },
);

test(
  "Phase 18D keeps Google-only accounts provider-owned",
  { skip: !enabled },
  async () => {
    const [{ db }, credentials, totp] = await Promise.all([
      import("../lib/db"),
      import("../lib/account-credentials"),
      import("../lib/account-totp"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18d-provider-${suffix}`;
    const email = `${userId}@example.com`;
    const session = {
      id: `phase18d-provider-session-${suffix}`,
      token: `phase18d-provider-token-${suffix}`,
    };

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase 18D Provider",
          email,
          emailVerified: true,
          accounts: {
            create: {
              id: `phase18d-provider-account-${suffix}`,
              accountId: `google-${suffix}`,
              providerId: "google",
            },
          },
          sessions: {
            create: {
              ...session,
              expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
            },
          },
        },
      });

      await expectAccountFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            userId,
            sessionId: session.id,
            sessionToken: session.token,
            currentEmail: email,
            newEmail: `replacement-${email}`,
            confirmationEmail: `replacement-${email}`,
            currentPassword: "not-a-local-credential",
            secondFactorCode: "",
            twoFactorRequired: false,
            secret: process.env.BETTER_AUTH_SECRET ?? "phase18d-test-secret",
          }),
        "CREDENTIAL_REQUIRED",
      );
      await expectAccountFailure(
        () =>
          totp.beginAccountTotpChange({
            userId,
            sessionId: session.id,
            sessionToken: session.token,
            currentPassword: "not-a-local-credential",
            purpose: "enable",
          }),
        "CREDENTIAL_REQUIRED",
      );

      const provider = await db.account.findFirstOrThrow({
        where: { userId },
        select: { providerId: true, password: true },
      });
      assert.deepEqual(provider, { providerId: "google", password: null });
      assert.equal(await db.session.count({ where: { userId } }), 1);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
        email,
      );
    } finally {
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
  },
);
