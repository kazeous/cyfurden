import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const MAX_REASON_LENGTH = 500;
const MAX_ACTION_LENGTH = 120;
const MAX_TARGET_ID_LENGTH = 240;
const MAX_METADATA_BYTES = 16_384;
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 50;
const MAX_METADATA_ARRAY_ITEMS = 25;
const MAX_METADATA_STRING_LENGTH = 500;

const sensitiveKeyPattern =
  /(password|secret|token|cookie|authorization|apikey|accesskey|connectionstring|databaseurl|objectkey|signedurl|accountnumber|bankdetail|transferreference|customer(address|note|phone|email)|shippingaddress|ordercontent|payment)/i;
const sensitiveInlineValuePattern =
  /((?:password|secret|token|cookie|authorization|api\s*key|access\s*key|connection\s*string|database\s*url|object\s*key|signed\s*url|bank\s*(?:account|details?)|account\s*number|transfer\s*reference|customer\s*(?:address|note|phone)|shipping\s*address)\s*(?::|=)\s*)([^,;\n]+)/gi;

type AuditClient = Pick<Prisma.TransactionClient, "platformAuditLog">;

type PlatformAuditTargetType =
  | "PLATFORM"
  | "USER"
  | "BOOTH"
  | "MEMBERSHIP"
  | "PLATFORM_ROLE_GRANT"
  | "QUOTA"
  | "STORAGE_ASSET"
  | "STORAGE_RECONCILIATION"
  | "DELETION_REQUEST";

function requireBoundedText(
  value: string,
  label: string,
  maximumLength: number,
) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`${label} must contain 1-${maximumLength} characters.`);
  }
  return normalized;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_METADATA_DEPTH) return "[TRUNCATED]";
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return redactPlatformAuditText(value).slice(0, MAX_METADATA_STRING_LENGTH);
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_ITEMS)
      .map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_METADATA_KEYS)
        .map(([key, entry]) => [
          key,
          sensitiveKeyPattern.test(key)
            ? "[REDACTED]"
            : redactValue(entry, depth + 1),
        ]),
    );
  }
  return String(value).slice(0, MAX_METADATA_STRING_LENGTH);
}

export function redactPlatformAuditText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(sensitiveInlineValuePattern, "$1[REDACTED]");
}

export function redactPlatformAuditMetadata(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const redacted = redactValue(value, 0) as Prisma.InputJsonValue;
  const serialized = JSON.stringify(redacted);
  if (Buffer.byteLength(serialized, "utf8") > MAX_METADATA_BYTES) {
    throw new Error(
      `Platform audit metadata must not exceed ${MAX_METADATA_BYTES} bytes.`,
    );
  }
  return redacted;
}

export interface RecordPlatformAuditInput {
  actorUserId: string;
  action: string;
  targetType: PlatformAuditTargetType;
  targetId?: string | null;
  reason: string;
  beforeMetadata?: unknown;
  afterMetadata?: unknown;
  correlationId?: string;
}

export async function recordPlatformAudit(
  input: RecordPlatformAuditInput,
  client: AuditClient = db,
) {
  const actorUserId = requireBoundedText(input.actorUserId, "Actor ID", 240);
  const action = requireBoundedText(
    input.action,
    "Platform audit action",
    MAX_ACTION_LENGTH,
  );
  const reason = redactPlatformAuditText(
    requireBoundedText(
      input.reason,
      "Platform audit reason",
      MAX_REASON_LENGTH,
    ),
  );
  const targetId = input.targetId
    ? requireBoundedText(
        input.targetId,
        "Platform audit target ID",
        MAX_TARGET_ID_LENGTH,
      )
    : null;
  const correlationId = requireBoundedText(
    input.correlationId ?? randomUUID(),
    "Platform audit correlation ID",
    120,
  );

  return client.platformAuditLog.create({
    data: {
      actorUserId,
      action,
      targetType: input.targetType,
      targetId,
      reason,
      beforeMetadata: redactPlatformAuditMetadata(input.beforeMetadata),
      afterMetadata: redactPlatformAuditMetadata(input.afterMetadata),
      correlationId,
    },
  });
}
