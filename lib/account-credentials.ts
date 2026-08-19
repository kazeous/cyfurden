import { createOTP } from "@better-auth/utils/otp";
import {
  parseEnvelope,
  symmetricDecrypt,
  symmetricEncrypt,
  verifyPassword,
  type SecretConfig,
} from "better-auth/crypto";
import {
  validateEmailReplacement,
  type EmailReplacementInput,
} from "@/lib/account-credentials-validation";
import { runSerializableTransaction } from "@/lib/serializable-transaction";

export type AccountEmailChangeFailure =
  | "INVALID_INPUT"
  | "SESSION_INVALID"
  | "ACCOUNT_UNAVAILABLE"
  | "CREDENTIAL_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "EMAIL_UNAVAILABLE";

export class AccountEmailChangeError extends Error {
  constructor(readonly code: AccountEmailChangeFailure) {
    super(code);
    this.name = "AccountEmailChangeError";
  }
}

type ChangeAccountEmailInput = EmailReplacementInput & {
  userId: string;
  sessionId: string;
  sessionToken: string;
  secret: string | SecretConfig;
};

function isCurrentlyBanned(
  banned: boolean | null,
  banExpires: Date | null,
  now: Date,
) {
  return (
    banned === true && (!banExpires || banExpires.getTime() > now.getTime())
  );
}

function readBackupCodes(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((code) => typeof code === "string")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function verifyAccountSecondFactor(input: {
  code: string;
  secret: string | SecretConfig;
  encryptedSecret: string;
  backupCodes: string;
}) {
  if (/^\d{6}$/u.test(input.code)) {
    const totpSecret = await symmetricDecrypt({
      data: input.encryptedSecret,
      key: input.secret,
    });
    if (
      await createOTP(totpSecret, { digits: 6, period: 30 }).verify(input.code)
    ) {
      return { ok: true as const, backupCodes: null };
    }
  }

  const encrypted = parseEnvelope(input.backupCodes) !== null;
  const serialized = encrypted
    ? await symmetricDecrypt({ data: input.backupCodes, key: input.secret })
    : input.backupCodes;
  const backupCodes = readBackupCodes(serialized);
  if (!backupCodes?.includes(input.code)) return { ok: false as const };

  const remaining = JSON.stringify(
    backupCodes.filter((backupCode) => backupCode !== input.code),
  );
  return {
    ok: true as const,
    backupCodes: encrypted
      ? await symmetricEncrypt({ data: remaining, key: input.secret })
      : remaining,
  };
}

export async function changeCurrentAccountEmail(
  input: ChangeAccountEmailInput,
) {
  const validation = validateEmailReplacement(input);
  if (!validation.ok) throw new AccountEmailChangeError("INVALID_INPUT");

  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const user = await transaction.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        banned: true,
        banExpires: true,
        twoFactorEnabled: true,
      },
    });
    const session = await transaction.session.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        token: true,
        userId: true,
        expiresAt: true,
        impersonatedBy: true,
      },
    });
    const credential = await transaction.account.findFirst({
      where: {
        userId: input.userId,
        providerId: "credential",
        password: { not: null },
      },
      select: { id: true, password: true },
    });
    const twoFactor = await transaction.twoFactor.findUnique({
      where: { userId: input.userId },
      select: {
        id: true,
        secret: true,
        backupCodes: true,
        verified: true,
      },
    });

    if (
      !session ||
      session.userId !== input.userId ||
      session.token !== input.sessionToken ||
      session.expiresAt.getTime() <= now.getTime() ||
      session.impersonatedBy
    ) {
      throw new AccountEmailChangeError("SESSION_INVALID");
    }
    if (!user || isCurrentlyBanned(user.banned, user.banExpires, now)) {
      throw new AccountEmailChangeError("ACCOUNT_UNAVAILABLE");
    }
    if (!credential?.password) {
      throw new AccountEmailChangeError("CREDENTIAL_REQUIRED");
    }
    if (
      !(await verifyPassword({
        hash: credential.password,
        password: validation.value.currentPassword,
      }))
    ) {
      throw new AccountEmailChangeError("AUTHENTICATION_FAILED");
    }

    let replacementBackupCodes: string | null = null;
    if (user.twoFactorEnabled === true) {
      if (!twoFactor?.verified || !validation.value.secondFactorCode) {
        throw new AccountEmailChangeError("AUTHENTICATION_FAILED");
      }
      const verification = await verifyAccountSecondFactor({
        code: validation.value.secondFactorCode,
        secret: input.secret,
        encryptedSecret: twoFactor.secret,
        backupCodes: twoFactor.backupCodes,
      });
      if (!verification.ok) {
        throw new AccountEmailChangeError("AUTHENTICATION_FAILED");
      }
      replacementBackupCodes = verification.backupCodes;
    }

    const collision = await transaction.user.findUnique({
      where: { email: validation.value.newEmail },
      select: { id: true },
    });
    if (collision && collision.id !== user.id) {
      throw new AccountEmailChangeError("EMAIL_UNAVAILABLE");
    }

    if (replacementBackupCodes && twoFactor) {
      const consumed = await transaction.twoFactor.updateMany({
        where: {
          id: twoFactor.id,
          userId: user.id,
          backupCodes: twoFactor.backupCodes,
        },
        data: { backupCodes: replacementBackupCodes },
      });
      if (consumed.count !== 1) {
        throw new AccountEmailChangeError("AUTHENTICATION_FAILED");
      }
    }

    try {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          email: validation.value.newEmail,
          emailVerified: false,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      throw new AccountEmailChangeError("EMAIL_UNAVAILABLE");
    }
    await transaction.session.deleteMany({ where: { userId: user.id } });

    return { email: validation.value.newEmail, userId: user.id };
  });
}
