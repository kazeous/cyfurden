import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.CYFURDEN_PHASE18_INTEGRATION === "1";

async function expectChangeFailure(
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
  "Phase 18B changes a credential email atomically and preserves identity grants",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, credentials] = await Promise.all([
      import("../lib/db"),
      import("better-auth/crypto"),
      import("../lib/account-credentials"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18b-user-${suffix}`;
    const collisionId = `phase18b-collision-${suffix}`;
    const socialId = `phase18b-social-${suffix}`;
    const oldEmail = `phase18b-old-${suffix}@example.com`;
    const newEmail = `phase18b-new-${suffix}@example.com`;
    const collisionEmail = `phase18b-taken-${suffix}@example.com`;
    const password = "Current-password-18B";
    const secret = process.env.BETTER_AUTH_SECRET ?? "phase18b-test-secret";
    const totpSecret = "JBSWY3DPEHPK3PXP";
    const recoveryCode = "ABCDE-FGHIJ";
    const now = new Date();
    const session = {
      id: `phase18b-session-${suffix}`,
      token: `phase18b-token-${suffix}`,
    };
    let boothId: string | null = null;

    try {
      const passwordHash = await crypto.hashPassword(password);
      await db.user.create({
        data: {
          id: userId,
          name: "Phase 18B Owner",
          email: oldEmail,
          emailVerified: true,
          role: "PLATFORM_VIEWER",
          twoFactorEnabled: true,
          accounts: {
            create: {
              id: `phase18b-account-${suffix}`,
              accountId: userId,
              providerId: "credential",
              password: passwordHash,
            },
          },
          twoFactors: {
            create: {
              id: `phase18b-factor-${suffix}`,
              secret: await crypto.symmetricEncrypt({
                data: totpSecret,
                key: secret,
              }),
              backupCodes: JSON.stringify([recoveryCode, "KLMNO-PQRST"]),
              verified: true,
            },
          },
          sessions: {
            create: [
              {
                ...session,
                expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
                platformAuthenticatedAt: now,
              },
              {
                id: `phase18b-other-session-${suffix}`,
                token: `phase18b-other-token-${suffix}`,
                expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
              },
            ],
          },
          platformRoleGrant: {
            create: {
              role: "PLATFORM_VIEWER",
              grantedByUserId: userId,
              grantReason: "Phase 18B acceptance",
            },
          },
        },
      });
      await db.user.createMany({
        data: [
          {
            id: collisionId,
            name: "Collision Account",
            email: collisionEmail,
            emailVerified: true,
          },
          {
            id: socialId,
            name: "Social Account",
            email: `phase18b-social-${suffix}@example.com`,
            emailVerified: true,
          },
        ],
      });
      await db.account.create({
        data: {
          id: `phase18b-social-account-${suffix}`,
          accountId: socialId,
          providerId: "google",
          userId: socialId,
        },
      });
      await db.session.create({
        data: {
          id: `phase18b-social-session-${suffix}`,
          token: `phase18b-social-token-${suffix}`,
          userId: socialId,
          expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
        },
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase18b-${suffix.slice(0, 16)}`,
          name: "Phase 18B Booth",
          ownerId: userId,
          memberships: {
            create: { userId, role: "OWNER", status: "ACTIVE" },
          },
          invitations: {
            create: {
              email: oldEmail,
              role: "STAFF",
              tokenHash: `phase18b-invite-${suffix}`,
              expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
              invitedById: userId,
            },
          },
        },
      });
      boothId = booth.id;

      const baseInput = {
        userId,
        sessionId: session.id,
        sessionToken: session.token,
        currentEmail: oldEmail,
        newEmail,
        confirmationEmail: newEmail,
        currentPassword: password,
        secondFactorCode: recoveryCode,
        twoFactorRequired: true,
        secret,
      };

      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            currentPassword: "wrong-password",
          }),
        "AUTHENTICATION_FAILED",
      );
      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            newEmail: "not-an-email",
            confirmationEmail: "different@example.com",
          }),
        "INVALID_INPUT",
      );
      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            secondFactorCode: "000000",
          }),
        "AUTHENTICATION_FAILED",
      );
      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            newEmail: collisionEmail,
            confirmationEmail: collisionEmail,
          }),
        "EMAIL_UNAVAILABLE",
      );
      assert.equal(await db.session.count({ where: { userId } }), 2);
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: userId } })).email,
        oldEmail,
      );

      await db.user.update({ where: { id: userId }, data: { banned: true } });
      await expectChangeFailure(
        () => credentials.changeCurrentAccountEmail(baseInput),
        "ACCOUNT_UNAVAILABLE",
      );
      await db.user.update({ where: { id: userId }, data: { banned: false } });

      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            userId: socialId,
            sessionId: `phase18b-social-session-${suffix}`,
            sessionToken: `phase18b-social-token-${suffix}`,
            currentEmail: `phase18b-social-${suffix}@example.com`,
          }),
        "CREDENTIAL_REQUIRED",
      );
      await expectChangeFailure(
        () =>
          credentials.changeCurrentAccountEmail({
            ...baseInput,
            sessionId: "replayed-session",
            sessionToken: "replayed-token",
          }),
        "SESSION_INVALID",
      );

      const result = await credentials.changeCurrentAccountEmail({
        ...baseInput,
        newEmail: newEmail.toUpperCase(),
      });
      assert.deepEqual(result, { email: newEmail, userId });

      const [updated, sessions, invitation, membership, grant, factor] =
        await Promise.all([
          db.user.findUniqueOrThrow({ where: { id: userId } }),
          db.session.count({ where: { userId } }),
          db.teamInvitation.findUniqueOrThrow({
            where: { tokenHash: `phase18b-invite-${suffix}` },
          }),
          db.boothMembership.findUniqueOrThrow({
            where: { boothId_userId: { boothId: booth.id, userId } },
          }),
          db.platformRoleGrant.findUniqueOrThrow({ where: { userId } }),
          db.twoFactor.findUniqueOrThrow({ where: { userId } }),
        ]);
      assert.equal(updated.id, userId);
      assert.equal(updated.email, newEmail);
      assert.equal(updated.emailVerified, false);
      assert.equal(sessions, 0);
      assert.equal(invitation.email, oldEmail);
      assert.equal(invitation.status, "PENDING");
      assert.equal(membership.role, "OWNER");
      assert.equal(grant.status, "ACTIVE");
      assert.deepEqual(JSON.parse(factor.backupCodes), ["KLMNO-PQRST"]);

      const { auth } = await import("../lib/auth");
      const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
      const signIn = (email: string) =>
        auth.handler(
          new Request(`${origin}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: origin },
            body: JSON.stringify({ email, password }),
          }),
        );
      assert.equal((await signIn(oldEmail)).ok, false);
      const newEmailSignIn = await signIn(newEmail);
      assert.equal(newEmailSignIn.ok, true);
      assert.equal(
        ((await newEmailSignIn.json()) as { twoFactorRedirect?: boolean })
          .twoFactorRedirect,
        true,
      );
    } finally {
      if (boothId) await db.booth.deleteMany({ where: { id: boothId } });
      await db.user.deleteMany({
        where: { id: { in: [userId, collisionId, socialId] } },
      });
      await db.$disconnect();
    }
  },
);

test(
  "Phase 18B password replacement leaves one fresh non-step-up session",
  { skip: !enabled },
  async () => {
    const [{ db }, crypto, { auth }] = await Promise.all([
      import("../lib/db"),
      import("better-auth/crypto"),
      import("../lib/auth"),
    ]);
    const suffix = randomUUID().replaceAll("-", "");
    const userId = `phase18b-password-${suffix}`;
    const email = `${userId}@example.com`;
    const currentPassword = "Current-password-18B";
    const newPassword = "Replacement-password-18B";
    const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";

    try {
      await db.user.create({
        data: {
          id: userId,
          name: "Phase 18B Password",
          email,
          emailVerified: true,
          accounts: {
            create: {
              id: `phase18b-password-account-${suffix}`,
              accountId: userId,
              providerId: "credential",
              password: await crypto.hashPassword(currentPassword),
            },
          },
          sessions: {
            create: {
              id: `phase18b-prior-session-${suffix}`,
              token: `phase18b-prior-token-${suffix}`,
              expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
            },
          },
        },
      });
      const signInResponse = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ email, password: currentPassword }),
        }),
      );
      assert.equal(signInResponse.ok, true);
      const setCookies =
        typeof signInResponse.headers.getSetCookie === "function"
          ? signInResponse.headers.getSetCookie()
          : [signInResponse.headers.get("set-cookie") ?? ""];
      const sessionCookie = setCookies
        .find((cookie) => cookie.startsWith("better-auth.session_token="))
        ?.split(";", 1)[0];
      assert.ok(sessionCookie);

      const signedInSession = await db.session.findFirstOrThrow({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      await db.session.update({
        where: { id: signedInSession.id },
        data: { platformAuthenticatedAt: new Date() },
      });

      const wrongResponse = await auth.handler(
        new Request(`${origin}/api/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: origin,
          },
          body: JSON.stringify({
            currentPassword: "wrong-password",
            newPassword,
            revokeOtherSessions: true,
          }),
        }),
      );
      assert.equal(wrongResponse.ok, false);
      assert.equal(await db.session.count({ where: { userId } }), 2);

      const changeResponse = await auth.handler(
        new Request(`${origin}/api/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: origin,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            revokeOtherSessions: true,
          }),
        }),
      );
      assert.equal(changeResponse.ok, true);
      const sessions = await db.session.findMany({ where: { userId } });
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0]?.platformAuthenticatedAt, null);
      assert.notEqual(sessions[0]?.id, signedInSession.id);

      const account = await db.account.findFirstOrThrow({
        where: { userId, providerId: "credential" },
      });
      assert.ok(account.password);
      assert.equal(
        await crypto.verifyPassword({
          hash: account.password,
          password: newPassword,
        }),
        true,
      );
      assert.equal(
        await crypto.verifyPassword({
          hash: account.password,
          password: currentPassword,
        }),
        false,
      );
    } finally {
      await db.user.deleteMany({ where: { id: userId } });
      await db.$disconnect();
    }
  },
);
