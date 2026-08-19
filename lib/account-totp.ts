import { createOTP } from "@better-auth/utils/otp";
import { randomBytes, randomUUID } from "node:crypto";
import {
  symmetricDecrypt,
  symmetricEncrypt,
  verifyPassword,
  type SecretConfig,
} from "better-auth/crypto";
import {
  validateAccountTotpBegin,
  validateAccountTotpCode,
  validateAccountTotpDisable,
  type AccountTotpPurpose,
} from "@/lib/account-totp-validation";
import { runSerializableTransaction } from "@/lib/serializable-transaction";

const DEFAULT_DEVELOPMENT_AUTH_SECRET =
  "better-auth-secret-12345678901234567890";
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1_000;
const FACTOR_PROOF_LIFETIME_MS = 2 * 60 * 1_000;
const TOTP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const cyfurdenAuthSecret =
  process.env.BETTER_AUTH_SECRET ?? DEFAULT_DEVELOPMENT_AUTH_SECRET;

export type AccountTotpFailure =
  | "INVALID_INPUT"
  | "SESSION_INVALID"
  | "ACCOUNT_UNAVAILABLE"
  | "CREDENTIAL_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "STATE_CONFLICT"
  | "CHALLENGE_INVALID"
  | "PLATFORM_TOTP_REQUIRED";

export class AccountTotpError extends Error {
  constructor(readonly code: AccountTotpFailure) {
    super(code);
    this.name = "AccountTotpError";
  }
}

type AccountTotpSessionInput = {
  userId: string;
  sessionId: string;
  sessionToken: string;
};

type PendingChallenge = {
  version: 1;
  kind: "account-totp-challenge";
  purpose: AccountTotpPurpose;
  userId: string;
  sessionId: string;
  secret: string;
  recoveryCodes: string[];
};

type FactorProof = {
  version: 1;
  kind: "account-totp-factor-proof";
  userId: string;
  sessionId: string;
};

function challengeIdentifier(userId: string, sessionId: string) {
  return `cyfurden:account-totp-challenge:${userId}:${sessionId}`;
}

function proofIdentifier(userId: string, sessionId: string) {
  return `cyfurden:account-totp-proof:${userId}:${sessionId}`;
}

function isCurrentlyBanned(
  banned: boolean | null,
  banExpires: Date | null,
  now: Date,
) {
  return (
    banned === true && (!banExpires || banExpires.getTime() > now.getTime())
  );
}

function randomCharacters(length: number, alphabet: string) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
}

function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const code = randomCharacters(10, RECOVERY_ALPHABET);
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

async function encryptPayload(payload: PendingChallenge | FactorProof) {
  return symmetricEncrypt({
    data: JSON.stringify(payload),
    key: cyfurdenAuthSecret,
  });
}

async function decryptPayload(value: string): Promise<unknown> {
  try {
    return JSON.parse(
      await symmetricDecrypt({ data: value, key: cyfurdenAuthSecret }),
    );
  } catch {
    return null;
  }
}

function isPendingChallenge(
  value: unknown,
  input: AccountTotpSessionInput,
): value is PendingChallenge {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PendingChallenge>;
  return (
    candidate.version === 1 &&
    candidate.kind === "account-totp-challenge" &&
    (candidate.purpose === "enable" || candidate.purpose === "resync") &&
    candidate.userId === input.userId &&
    candidate.sessionId === input.sessionId &&
    typeof candidate.secret === "string" &&
    /^[A-Z2-7]{32}$/u.test(candidate.secret) &&
    Array.isArray(candidate.recoveryCodes) &&
    candidate.recoveryCodes.length === 10 &&
    candidate.recoveryCodes.every(
      (code) =>
        typeof code === "string" &&
        /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/u.test(code),
    )
  );
}

function isFactorProof(
  value: unknown,
  userId: string,
  sessionId: string,
): value is FactorProof {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FactorProof>;
  return (
    candidate.version === 1 &&
    candidate.kind === "account-totp-factor-proof" &&
    candidate.userId === userId &&
    candidate.sessionId === sessionId
  );
}

async function requireLiveAccountSession(
  transaction: Parameters<Parameters<typeof runSerializableTransaction>[0]>[0],
  input: AccountTotpSessionInput,
  now: Date,
) {
  const [session, user, credential, factor] = await Promise.all([
    transaction.session.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        token: true,
        userId: true,
        expiresAt: true,
        impersonatedBy: true,
      },
    }),
    transaction.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        banned: true,
        banExpires: true,
        twoFactorEnabled: true,
      },
    }),
    transaction.account.findFirst({
      where: {
        userId: input.userId,
        providerId: "credential",
        password: { not: null },
      },
      select: { id: true, password: true },
    }),
    transaction.twoFactor.findUnique({
      where: { userId: input.userId },
      select: { id: true, verified: true },
    }),
  ]);

  if (
    !session ||
    session.userId !== input.userId ||
    session.token !== input.sessionToken ||
    session.expiresAt.getTime() <= now.getTime() ||
    session.impersonatedBy
  ) {
    throw new AccountTotpError("SESSION_INVALID");
  }
  if (!user || isCurrentlyBanned(user.banned, user.banExpires, now)) {
    throw new AccountTotpError("ACCOUNT_UNAVAILABLE");
  }
  if (!credential?.password) {
    throw new AccountTotpError("CREDENTIAL_REQUIRED");
  }

  return { credential, factor, session, user };
}

async function consumeFactorProof(
  transaction: Parameters<Parameters<typeof runSerializableTransaction>[0]>[0],
  input: AccountTotpSessionInput,
  now: Date,
) {
  const proof = await transaction.verification.findFirst({
    where: {
      identifier: proofIdentifier(input.userId, input.sessionId),
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!proof) throw new AccountTotpError("AUTHENTICATION_FAILED");
  const payload = await decryptPayload(proof.value);
  if (!isFactorProof(payload, input.userId, input.sessionId)) {
    throw new AccountTotpError("AUTHENTICATION_FAILED");
  }
  const consumed = await transaction.verification.deleteMany({
    where: { id: proof.id, identifier: proof.identifier, value: proof.value },
  });
  if (consumed.count !== 1) {
    throw new AccountTotpError("AUTHENTICATION_FAILED");
  }
}

export async function encryptAccountBackupCodes(
  serializedCodes: string,
  key: string | SecretConfig = cyfurdenAuthSecret,
) {
  return symmetricEncrypt({
    data: serializedCodes,
    key,
  });
}

export function accountBackupCodesAreEncrypted(storedCodes: string) {
  try {
    const parsed: unknown = JSON.parse(storedCodes);
    return !(
      Array.isArray(parsed) && parsed.every((code) => typeof code === "string")
    );
  } catch {
    return true;
  }
}

export async function decryptAccountBackupCodes(
  storedCodes: string,
  key: string | SecretConfig = cyfurdenAuthSecret,
) {
  if (!accountBackupCodesAreEncrypted(storedCodes)) return storedCodes;
  return symmetricDecrypt({ data: storedCodes, key });
}

export async function recordAccountTotpFactorProof(input: {
  userId: string;
  sessionId: string;
}) {
  const identifier = proofIdentifier(input.userId, input.sessionId);
  const value = await encryptPayload({
    version: 1,
    kind: "account-totp-factor-proof",
    userId: input.userId,
    sessionId: input.sessionId,
  });
  await runSerializableTransaction(async (transaction) => {
    await transaction.verification.deleteMany({ where: { identifier } });
    await transaction.verification.create({
      data: {
        id: randomUUID(),
        identifier,
        value,
        expiresAt: new Date(Date.now() + FACTOR_PROOF_LIFETIME_MS),
      },
    });
  });
}

export async function beginAccountTotpChange(
  input: AccountTotpSessionInput & {
    currentPassword: unknown;
    purpose: unknown;
  },
) {
  const validation = validateAccountTotpBegin(input);
  if (!validation.ok) throw new AccountTotpError("INVALID_INPUT");

  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const account = await requireLiveAccountSession(transaction, input, now);
    if (
      !(await verifyPassword({
        hash: account.credential.password!,
        password: validation.value.currentPassword,
      }))
    ) {
      throw new AccountTotpError("AUTHENTICATION_FAILED");
    }

    const currentlyEnabled =
      account.user.twoFactorEnabled === true &&
      account.factor?.verified === true;
    if (validation.value.purpose === "enable" && currentlyEnabled) {
      throw new AccountTotpError("STATE_CONFLICT");
    }
    if (validation.value.purpose === "resync") {
      if (!currentlyEnabled) throw new AccountTotpError("STATE_CONFLICT");
      await consumeFactorProof(transaction, input, now);
    }

    const secret = randomCharacters(32, TOTP_ALPHABET);
    const recoveryCodes = generateRecoveryCodes();
    const identifier = challengeIdentifier(input.userId, input.sessionId);
    const expiresAt = new Date(now.getTime() + CHALLENGE_LIFETIME_MS);
    const value = await encryptPayload({
      version: 1,
      kind: "account-totp-challenge",
      purpose: validation.value.purpose,
      userId: input.userId,
      sessionId: input.sessionId,
      secret,
      recoveryCodes,
    });

    await transaction.verification.deleteMany({ where: { identifier } });
    await transaction.verification.create({
      data: { id: randomUUID(), identifier, value, expiresAt },
    });

    return {
      expiresAt: expiresAt.toISOString(),
      setupKey: secret,
      totpURI: createOTP(secret, { digits: 6, period: 30 }).url(
        "Cyfurden",
        account.user.email,
      ),
    };
  });
}

export async function confirmAccountTotpChange(
  input: AccountTotpSessionInput & { code: unknown },
) {
  const validation = validateAccountTotpCode(input.code);
  if (!validation.ok) throw new AccountTotpError("INVALID_INPUT");

  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const account = await requireLiveAccountSession(transaction, input, now);
    const identifier = challengeIdentifier(input.userId, input.sessionId);
    const challenge = await transaction.verification.findFirst({
      where: { identifier, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new AccountTotpError("CHALLENGE_INVALID");
    const payload = await decryptPayload(challenge.value);
    if (!isPendingChallenge(payload, input)) {
      throw new AccountTotpError("CHALLENGE_INVALID");
    }

    const validCode = await createOTP(payload.secret, {
      digits: 6,
      period: 30,
    }).verify(validation.value);
    if (!validCode) throw new AccountTotpError("AUTHENTICATION_FAILED");

    const currentlyEnabled =
      account.user.twoFactorEnabled === true &&
      account.factor?.verified === true;
    if (
      (payload.purpose === "enable" && currentlyEnabled) ||
      (payload.purpose === "resync" && !currentlyEnabled)
    ) {
      throw new AccountTotpError("STATE_CONFLICT");
    }

    const [secret, backupCodes] = await Promise.all([
      symmetricEncrypt({ data: payload.secret, key: cyfurdenAuthSecret }),
      encryptAccountBackupCodes(JSON.stringify(payload.recoveryCodes)),
    ]);
    await transaction.twoFactor.upsert({
      where: { userId: input.userId },
      create: {
        id: randomUUID(),
        userId: input.userId,
        secret,
        backupCodes,
        verified: true,
      },
      update: {
        secret,
        backupCodes,
        verified: true,
        failedVerificationCount: 0,
        lockedUntil: null,
      },
    });
    await transaction.user.update({
      where: { id: input.userId },
      data: { twoFactorEnabled: true },
    });
    if (payload.purpose === "resync") {
      await transaction.session.deleteMany({
        where: { userId: input.userId, id: { not: input.sessionId } },
      });
      await transaction.session.update({
        where: { id: input.sessionId },
        data: { platformAuthenticatedAt: null },
      });
    }
    const consumed = await transaction.verification.deleteMany({
      where: {
        id: challenge.id,
        identifier: challenge.identifier,
        value: challenge.value,
      },
    });
    if (consumed.count !== 1) {
      throw new AccountTotpError("CHALLENGE_INVALID");
    }

    return {
      purpose: payload.purpose,
      recoveryCodes: payload.recoveryCodes,
    };
  });
}

export async function disableAccountTotp(
  input: AccountTotpSessionInput & {
    currentPassword: unknown;
    currentFactorCode: unknown;
    confirmDisable: unknown;
  },
) {
  const validation = validateAccountTotpDisable(input);
  if (!validation.ok) throw new AccountTotpError("INVALID_INPUT");

  return runSerializableTransaction(async (transaction) => {
    const now = new Date();
    const account = await requireLiveAccountSession(transaction, input, now);
    const activeGrant = await transaction.platformRoleGrant.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (activeGrant) throw new AccountTotpError("PLATFORM_TOTP_REQUIRED");
    if (
      account.user.twoFactorEnabled !== true ||
      account.factor?.verified !== true
    ) {
      throw new AccountTotpError("STATE_CONFLICT");
    }
    if (
      !(await verifyPassword({
        hash: account.credential.password!,
        password: validation.value.currentPassword,
      }))
    ) {
      throw new AccountTotpError("AUTHENTICATION_FAILED");
    }
    await consumeFactorProof(transaction, input, now);

    await transaction.user.update({
      where: { id: input.userId },
      data: { twoFactorEnabled: false },
    });
    await transaction.twoFactor.deleteMany({ where: { userId: input.userId } });
    await transaction.verification.deleteMany({
      where: {
        identifier: {
          in: [
            challengeIdentifier(input.userId, input.sessionId),
            proofIdentifier(input.userId, input.sessionId),
          ],
        },
      },
    });
    await transaction.session.deleteMany({
      where: { userId: input.userId, id: { not: input.sessionId } },
    });
    await transaction.session.update({
      where: { id: input.sessionId },
      data: { platformAuthenticatedAt: null },
    });

    return { status: true as const };
  });
}

export async function cancelAccountTotpChange(input: AccountTotpSessionInput) {
  await runSerializableTransaction(async (transaction) => {
    const now = new Date();
    await requireLiveAccountSession(transaction, input, now);
    await transaction.verification.deleteMany({
      where: { identifier: challengeIdentifier(input.userId, input.sessionId) },
    });
  });
  return { status: true as const };
}

export const accountTotpInternals = {
  challengeIdentifier,
  proofIdentifier,
  challengeLifetimeMs: CHALLENGE_LIFETIME_MS,
  factorProofLifetimeMs: FACTOR_PROOF_LIFETIME_MS,
};
