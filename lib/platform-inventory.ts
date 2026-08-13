import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { PlatformAccessResult } from "@/lib/platform-access";
import type { PlatformPermission } from "@/lib/platform-policy";
import { readPlatformQuotaDefaults } from "@/lib/platform-quotas";
import { expireStaleStorageReservations } from "@/lib/storage-ledger";

export const PLATFORM_INVENTORY_PAGE_SIZE = 20;
export const PLATFORM_AUDIT_PAGE_SIZE = 30;

const MAX_SEARCH_LENGTH = 100;
const OPEN_DELETION_STATES = ["PENDING", "FINALIZING", "BLOCKED"] as const;
const TRACKED_STORAGE_STATES = [
  "VERIFIED",
  "DETACHED",
  "DELETION_PENDING",
] as const;
const DRIFT_STORAGE_STATES = ["MISSING", "ORPHANED"] as const;
const AUDIT_TARGET_TYPES = [
  "PLATFORM",
  "USER",
  "BOOTH",
  "MEMBERSHIP",
  "PLATFORM_ROLE_GRANT",
  "QUOTA",
  "STORAGE_ASSET",
  "STORAGE_RECONCILIATION",
  "DELETION_REQUEST",
] as const;

type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizePlatformPage(value: unknown) {
  const parsed =
    typeof value === "string" && /^\d{1,7}$/.test(value)
      ? Number.parseInt(value, 10)
      : 1;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizePlatformSearch(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SEARCH_LENGTH);
}

function assertPlatformAccess(
  access: PlatformAccessResult,
  permission: PlatformPermission,
): asserts access is Extract<PlatformAccessResult, { allowed: true }> {
  if (!access.allowed || access.permission !== permission) {
    throw new Error("Platform inventory access denied.");
  }
}

function pagination(page: number, total: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function currentlySuspended(
  user: { banned: boolean | null; banExpires: Date | null },
  now: Date,
) {
  return (
    user.banned === true &&
    (!user.banExpires || user.banExpires.getTime() > now.getTime())
  );
}

function accountState(
  user: { banned: boolean | null; banExpires: Date | null },
  pendingDeletion: boolean,
  now: Date,
) {
  if (pendingDeletion) return "DELETION_PENDING" as const;
  if (currentlySuspended(user, now)) return "SUSPENDED" as const;
  return "ACTIVE" as const;
}

const readQuotaDefaults = () => readPlatformQuotaDefaults();

const inlineSensitiveValuePattern =
  /((?:password|secret|token|cookie|authorization|api\s*key|access\s*key|connection\s*string|database\s*url|object\s*key|signed\s*url|bank\s*(?:account|details?)|account\s*number|transfer\s*reference|customer\s*(?:address|note|phone)|shipping\s*address)\s*(?::|=)\s*)([^,;\n]+)/gi;
const sensitiveAuditKeyPattern =
  /(password|secret|token|cookie|authorization|apikey|accesskey|connectionstring|databaseurl|objectkey|signedurl|accountnumber|bankdetail|transferreference|customer(address|note|phone|email)|shippingaddress|ordercontent|payment)/i;
const safeAuditMetadataKeys = new Set([
  "active",
  "actorRole",
  "byteLength",
  "boothId",
  "configuredUserId",
  "credentialAccount",
  "enabled",
  "expiresAt",
  "maxFaceboothProjects",
  "maxOwnedBooths",
  "maxProducts",
  "maxStorageBytes",
  "maxTeamSeats",
  "missingObjectCount",
  "newRole",
  "newState",
  "newValue",
  "nextRole",
  "nextState",
  "oldRole",
  "oldState",
  "oldValue",
  "platformAuthenticatedAt",
  "previousRole",
  "previousState",
  "previousValue",
  "purpose",
  "reservedBytes",
  "reservedObjectCount",
  "role",
  "serviceState",
  "serviceVersion",
  "state",
  "status",
  "trackedBytes",
  "trackedObjectCount",
  "targetBoothId",
  "targetUserId",
  "twoFactorEnabled",
  "untrackedBytes",
  "untrackedObjectCount",
  "verified",
  "version",
  "runId",
]);

export function redactPlatformInventoryText(value: string) {
  return value
    .slice(0, 500)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(inlineSensitiveValuePattern, "$1[REDACTED]");
}

function safeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[TRUNCATED]";
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return redactPlatformInventoryText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => safeAuditMetadata(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([key, entry]) => {
          if (sensitiveAuditKeyPattern.test(key)) return [key, "[REDACTED]"];
          if (!safeAuditMetadataKeys.has(key)) return [key, "[REDACTED]"];
          return [key, safeAuditMetadata(entry, depth + 1)];
        }),
    );
  }
  return "[REDACTED]";
}

function serializeSafeAuditMetadata(value: Prisma.JsonValue | null) {
  if (value === null) return null;
  return JSON.stringify(safeAuditMetadata(value)).slice(0, 2_000);
}

type SafeAuditRow = {
  id: string;
  actor: { id: string; name: string | null; email: string | null };
  action: string;
  targetType: AuditTargetType;
  targetId: string | null;
  reason: string;
  beforeMetadata: string | null;
  afterMetadata: string | null;
  correlationId: string;
  createdAt: Date;
};

async function readSafeAuditRows(
  where: Prisma.PlatformAuditLogWhereInput,
  options: { skip?: number; take: number },
): Promise<SafeAuditRow[]> {
  const rows = await db.platformAuditLog.findMany({
    where,
    select: {
      id: true,
      actorUserId: true,
      action: true,
      targetType: true,
      targetId: true,
      reason: true,
      beforeMetadata: true,
      afterMetadata: true,
      correlationId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: options.skip,
    take: options.take,
  });
  const actorIds = [...new Set(rows.map(({ actorUserId }) => actorUserId))];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  return rows.map((row) => ({
    id: row.id,
    actor: actorById.get(row.actorUserId) ?? {
      id: row.actorUserId,
      name: null,
      email: null,
    },
    action: redactPlatformInventoryText(row.action).slice(0, 120),
    targetType: row.targetType,
    targetId: row.targetId
      ? redactPlatformInventoryText(row.targetId).slice(0, 240)
      : null,
    reason: redactPlatformInventoryText(row.reason),
    beforeMetadata: serializeSafeAuditMetadata(row.beforeMetadata),
    afterMetadata: serializeSafeAuditMetadata(row.afterMetadata),
    correlationId: redactPlatformInventoryText(row.correlationId).slice(0, 120),
    createdAt: row.createdAt,
  }));
}

type AccountCountRow = {
  total: number;
  active: number;
  suspended: number;
  pendingDeletion: number;
};

type StorageCountRow = {
  trackedBytes: string;
  trackedObjects: number;
  reservedBytes: string;
  reservedObjects: number;
  driftBytes: string;
  driftObjects: number;
};

async function readAccountCounts(now: Date) {
  const rows = await db.$queryRaw<AccountCountRow[]>`
    SELECT
      COUNT(*)::integer AS total,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1
          FROM "PlatformDeletionRequest" deletion
          WHERE deletion."targetType" = 'USER'
            AND deletion."targetId" = account.id
            AND deletion.state IN ('PENDING', 'FINALIZING', 'BLOCKED')
        )
        AND NOT (
          COALESCE(account.banned, false) = true
          AND (account."banExpires" IS NULL OR account."banExpires" > ${now})
        )
      )::integer AS active,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1
          FROM "PlatformDeletionRequest" deletion
          WHERE deletion."targetType" = 'USER'
            AND deletion."targetId" = account.id
            AND deletion.state IN ('PENDING', 'FINALIZING', 'BLOCKED')
        )
        AND COALESCE(account.banned, false) = true
        AND (account."banExpires" IS NULL OR account."banExpires" > ${now})
      )::integer AS suspended,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM "PlatformDeletionRequest" deletion
          WHERE deletion."targetType" = 'USER'
            AND deletion."targetId" = account.id
            AND deletion.state IN ('PENDING', 'FINALIZING', 'BLOCKED')
        )
      )::integer AS "pendingDeletion"
    FROM "user" account
  `;
  return rows[0] ?? { total: 0, active: 0, suspended: 0, pendingDeletion: 0 };
}

async function readStorageCounts(now: Date) {
  const rows = await db.$queryRaw<StorageCountRow[]>`
    SELECT
      COALESCE(SUM("byteLength") FILTER (
        WHERE state IN ('VERIFIED', 'DETACHED', 'DELETION_PENDING')
      ), 0)::text AS "trackedBytes",
      COUNT(*) FILTER (
        WHERE state IN ('VERIFIED', 'DETACHED', 'DELETION_PENDING')
      )::integer AS "trackedObjects",
      COALESCE(SUM("byteLength") FILTER (
        WHERE state = 'RESERVED' AND "reservationExpiresAt" > ${now}
      ), 0)::text AS "reservedBytes",
      COUNT(*) FILTER (
        WHERE state = 'RESERVED' AND "reservationExpiresAt" > ${now}
      )::integer AS "reservedObjects",
      COALESCE(SUM("byteLength") FILTER (
        WHERE state IN ('MISSING', 'ORPHANED')
      ), 0)::text AS "driftBytes",
      COUNT(*) FILTER (
        WHERE state IN ('MISSING', 'ORPHANED')
      )::integer AS "driftObjects"
    FROM "StorageAsset"
  `;
  return (
    rows[0] ?? {
      trackedBytes: "0",
      trackedObjects: 0,
      reservedBytes: "0",
      reservedObjects: 0,
      driftBytes: "0",
      driftObjects: 0,
    }
  );
}

async function readConfiguredStorageQuota() {
  const [defaults, boothCount, overrides] = await Promise.all([
    readQuotaDefaults(),
    db.booth.count(),
    db.boothQuotaOverride.findMany({ select: { maxStorageBytes: true } }),
  ]);
  let bytes = defaults.maxStorageBytes * BigInt(boothCount);
  for (const override of overrides) {
    if (override.maxStorageBytes !== null) {
      bytes += override.maxStorageBytes - defaults.maxStorageBytes;
    }
  }
  return bytes.toString();
}

export async function readPlatformShell(access: PlatformAccessResult): Promise<{
  role: Extract<PlatformAccessResult, { allowed: true }>["role"];
  user: { id: string; name: string; email: string };
}> {
  assertPlatformAccess(access, "platform.read");
  const user = await db.user.findUnique({
    where: { id: access.userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new Error("Platform operator identity is unavailable.");
  return { role: access.role, user };
}

export async function readPlatformOverview(
  access: PlatformAccessResult,
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  await expireStaleStorageReservations(undefined, now);
  const [
    accounts,
    boothServiceStates,
    boothPublicationStates,
    storage,
    configuredQuotaBytes,
    quotaDefaults,
    latestReconciliation,
    recentAudit,
  ] = await Promise.all([
    readAccountCounts(now),
    db.booth.groupBy({ by: ["serviceState"], _count: { _all: true } }),
    db.booth.groupBy({ by: ["status"], _count: { _all: true } }),
    readStorageCounts(now),
    readConfiguredStorageQuota(),
    readQuotaDefaults(),
    db.storageReconciliationRun.findFirst({
      select: { status: true, completedAt: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    readSafeAuditRows({}, { take: 8 }),
  ]);
  const service = Object.fromEntries(
    boothServiceStates.map((row) => [row.serviceState, row._count._all]),
  ) as Partial<Record<"ACTIVE" | "SUSPENDED" | "DELETION_PENDING", number>>;
  const publication = Object.fromEntries(
    boothPublicationStates.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<"DRAFT" | "PUBLISHED" | "ARCHIVED", number>>;
  const totalBooths = boothServiceStates.reduce(
    (total, row) => total + row._count._all,
    0,
  );
  return {
    accounts,
    quotaDefaults: {
      maxOwnedBooths: quotaDefaults.maxOwnedBooths,
      maxTeamSeats: quotaDefaults.maxTeamSeats,
      maxProducts: quotaDefaults.maxProducts,
      maxFaceboothProjects: quotaDefaults.maxFaceboothProjects,
      maxStorageBytes: quotaDefaults.maxStorageBytes.toString(),
      maxStorageMiB: (
        quotaDefaults.maxStorageBytes /
        (BigInt(1_024) * BigInt(1_024))
      ).toString(),
    },
    booths: {
      total: totalBooths,
      active: service.ACTIVE ?? 0,
      suspended: service.SUSPENDED ?? 0,
      pendingDeletion: service.DELETION_PENDING ?? 0,
      draft: publication.DRAFT ?? 0,
      published: publication.PUBLISHED ?? 0,
      archived: publication.ARCHIVED ?? 0,
    },
    storage: {
      ...storage,
      configuredQuotaBytes,
      lastReconciliationAt:
        latestReconciliation?.completedAt ??
        latestReconciliation?.createdAt ??
        null,
      lastReconciliationStatus: latestReconciliation?.status ?? null,
    },
    recentAudit,
  };
}

export async function readPlatformUsers(
  access: PlatformAccessResult,
  input: { page?: unknown; search?: unknown },
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  const page = normalizePlatformPage(input.page);
  const search = normalizePlatformSearch(input.search);
  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { id: search },
          { email: { equals: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const [[users, total], defaults] = await Promise.all([
    db.$transaction([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          banned: true,
          banExpires: true,
          createdAt: true,
          quotaOverride: { select: { maxOwnedBooths: true } },
          _count: {
            select: {
              sessions: { where: { expiresAt: { gt: now } } },
              ownedBooths: true,
              memberships: { where: { role: { not: "OWNER" } } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PLATFORM_INVENTORY_PAGE_SIZE,
        take: PLATFORM_INVENTORY_PAGE_SIZE,
      }),
      db.user.count({ where }),
    ]),
    readQuotaDefaults(),
  ]);
  const userIds = users.map(({ id }) => id);
  const deletionRequests = userIds.length
    ? await db.platformDeletionRequest.findMany({
        where: {
          targetType: "USER",
          targetId: { in: userIds },
          state: { in: [...OPEN_DELETION_STATES] },
        },
        select: { targetId: true },
      })
    : [];
  const pendingDeletionIds = new Set(
    deletionRequests.map(({ targetId }) => targetId),
  );
  return {
    query: search,
    pagination: pagination(page, total, PLATFORM_INVENTORY_PAGE_SIZE),
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      state: accountState(user, pendingDeletionIds.has(user.id), now),
      banExpires: user.banExpires,
      createdAt: user.createdAt,
      activeSessionCount: user._count.sessions,
      ownedBoothCount: user._count.ownedBooths,
      joinedBoothCount: user._count.memberships,
      effectiveOwnedBoothLimit:
        user.quotaOverride?.maxOwnedBooths ?? defaults.maxOwnedBooths,
    })),
  };
}

export async function readPlatformUserDetail(
  access: PlatformAccessResult,
  userId: string,
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  const normalizedId = normalizePlatformSearch(userId);
  if (!normalizedId || normalizedId !== userId) return null;
  const [user, defaults, deletionRequest, audit] = await Promise.all([
    db.user.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        banned: true,
        banReason: true,
        banExpires: true,
        twoFactorEnabled: true,
        createdAt: true,
        updatedAt: true,
        accounts: {
          select: { providerId: true },
          orderBy: [{ providerId: "asc" }, { createdAt: "asc" }],
        },
        twoFactors: { select: { verified: true }, take: 1 },
        sessions: {
          where: { expiresAt: { gt: now } },
          select: {
            createdAt: true,
            expiresAt: true,
            platformAuthenticatedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        ownedBooths: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            serviceState: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: 100,
        },
        memberships: {
          where: { role: { not: "OWNER" } },
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            booth: {
              select: {
                id: true,
                name: true,
                slug: true,
                serviceState: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 100,
        },
        quotaOverride: {
          select: { maxOwnedBooths: true, updatedAt: true },
        },
      },
    }),
    readQuotaDefaults(),
    db.platformDeletionRequest.findFirst({
      where: {
        targetType: "USER",
        targetId: normalizedId,
        state: { in: [...OPEN_DELETION_STATES] },
      },
      select: {
        state: true,
        requestedAt: true,
        coolingOffEndsAt: true,
      },
      orderBy: { requestedAt: "desc" },
    }),
    readSafeAuditRows(
      {
        OR: [
          { targetType: "USER", targetId: normalizedId },
          { targetType: "QUOTA", targetId: normalizedId },
        ],
      },
      { take: 12 },
    ),
  ]);
  if (!user) return null;
  const effectiveOwnedBoothLimit =
    user.quotaOverride?.maxOwnedBooths ?? defaults.maxOwnedBooths;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    state: accountState(user, Boolean(deletionRequest), now),
    suspensionReason: user.banReason
      ? redactPlatformInventoryText(user.banReason)
      : null,
    banExpires: user.banExpires,
    twoFactorEnabled: user.twoFactorEnabled === true,
    verifiedTotp: user.twoFactors[0]?.verified === true,
    authMethods: [
      ...new Set(user.accounts.map(({ providerId }) => providerId)),
    ],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    sessions: user.sessions,
    ownedBooths: user.ownedBooths,
    memberships: user.memberships,
    quota: {
      configured: user.quotaOverride?.maxOwnedBooths ?? null,
      effective: effectiveOwnedBoothLimit,
      overLimit: user.ownedBooths.length > effectiveOwnedBoothLimit,
      updatedAt: user.quotaOverride?.updatedAt ?? null,
    },
    deletionRequest,
    audit,
  };
}

function activeStorageWhere(now: Date): Prisma.StorageAssetWhereInput {
  return {
    OR: [
      { state: { in: [...TRACKED_STORAGE_STATES] } },
      { state: "RESERVED", reservationExpiresAt: { gt: now } },
      { state: { in: [...DRIFT_STORAGE_STATES] } },
    ],
  };
}

type BoothStorageUsage = {
  trackedBytes: bigint;
  reservedBytes: bigint;
  driftBytes: bigint;
};

async function readBoothStorageUsage(boothIds: string[], now: Date) {
  const usage = new Map<string, BoothStorageUsage>();
  if (!boothIds.length) return usage;
  const groups = await db.storageAsset.groupBy({
    by: ["boothId", "state"],
    where: { boothId: { in: boothIds }, ...activeStorageWhere(now) },
    _sum: { byteLength: true },
  });
  for (const group of groups) {
    const current = usage.get(group.boothId) ?? {
      trackedBytes: BigInt(0),
      reservedBytes: BigInt(0),
      driftBytes: BigInt(0),
    };
    const bytes = group._sum.byteLength ?? BigInt(0);
    if (TRACKED_STORAGE_STATES.includes(group.state as never)) {
      current.trackedBytes += bytes;
    } else if (group.state === "RESERVED") {
      current.reservedBytes += bytes;
    } else if (DRIFT_STORAGE_STATES.includes(group.state as never)) {
      current.driftBytes += bytes;
    }
    usage.set(group.boothId, current);
  }
  return usage;
}

function boothSearchWhere(search: string): Prisma.BoothWhereInput {
  if (!search) return {};
  return {
    OR: [
      { id: search },
      { slug: { equals: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      {
        owner: {
          is: {
            OR: [
              { id: search },
              { email: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

export async function readPlatformBooths(
  access: PlatformAccessResult,
  input: { page?: unknown; search?: unknown },
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  await expireStaleStorageReservations(undefined, now);
  const page = normalizePlatformPage(input.page);
  const search = normalizePlatformSearch(input.search);
  const where = boothSearchWhere(search);
  const [[booths, total], defaults] = await Promise.all([
    db.$transaction([
      db.booth.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          serviceState: true,
          status: true,
          updatedAt: true,
          owner: { select: { id: true, name: true, email: true } },
          quotaOverride: { select: { maxStorageBytes: true } },
          _count: {
            select: {
              memberships: { where: { status: "ACTIVE" } },
              products: true,
              faceboothProjects: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PLATFORM_INVENTORY_PAGE_SIZE,
        take: PLATFORM_INVENTORY_PAGE_SIZE,
      }),
      db.booth.count({ where }),
    ]),
    readQuotaDefaults(),
  ]);
  const storage = await readBoothStorageUsage(
    booths.map(({ id }) => id),
    now,
  );
  return {
    query: search,
    pagination: pagination(page, total, PLATFORM_INVENTORY_PAGE_SIZE),
    booths: booths.map((booth) => {
      const usage = storage.get(booth.id) ?? {
        trackedBytes: BigInt(0),
        reservedBytes: BigInt(0),
        driftBytes: BigInt(0),
      };
      return {
        id: booth.id,
        name: booth.name,
        slug: booth.slug,
        serviceState: booth.serviceState,
        publicationState: booth.status,
        owner: booth.owner,
        activeTeamSeats: booth._count.memberships,
        productCount: booth._count.products,
        faceboothProjectCount: booth._count.faceboothProjects,
        trackedStorageBytes: usage.trackedBytes.toString(),
        reservedStorageBytes: usage.reservedBytes.toString(),
        driftStorageBytes: usage.driftBytes.toString(),
        effectiveStorageQuotaBytes: (
          booth.quotaOverride?.maxStorageBytes ?? defaults.maxStorageBytes
        ).toString(),
        updatedAt: booth.updatedAt,
      };
    }),
  };
}

export async function readPlatformBoothDetail(
  access: PlatformAccessResult,
  boothId: string,
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  const normalizedId = normalizePlatformSearch(boothId);
  if (!normalizedId || normalizedId !== boothId) return null;
  await expireStaleStorageReservations(normalizedId, now);
  const [
    booth,
    defaults,
    storageGroups,
    storageAssets,
    deletionRequest,
    latestReconciliation,
    audit,
  ] = await Promise.all([
    db.booth.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        serviceState: true,
        serviceReason: true,
        serviceStateChangedAt: true,
        serviceVersion: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } },
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          take: 100,
        },
        quotaOverride: {
          select: {
            maxTeamSeats: true,
            maxProducts: true,
            maxFaceboothProjects: true,
            maxStorageBytes: true,
            updatedAt: true,
          },
        },
        _count: {
          select: {
            memberships: { where: { status: "ACTIVE" } },
            invitations: {
              where: { status: "PENDING", expiresAt: { gt: now } },
            },
            products: true,
            faceboothProjects: true,
            orders: true,
          },
        },
      },
    }),
    readQuotaDefaults(),
    db.storageAsset.groupBy({
      by: ["purpose", "state"],
      where: { boothId: normalizedId, ...activeStorageWhere(now) },
      _count: { _all: true },
      _sum: { byteLength: true },
    }),
    db.storageAsset.findMany({
      where: { boothId: normalizedId, ...activeStorageWhere(now) },
      select: {
        id: true,
        objectKey: true,
        purpose: true,
        state: true,
        byteLength: true,
        createdAt: true,
        verifiedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    db.platformDeletionRequest.findFirst({
      where: {
        targetType: "BOOTH",
        targetId: normalizedId,
        state: { in: [...OPEN_DELETION_STATES] },
      },
      select: { state: true, requestedAt: true, coolingOffEndsAt: true },
      orderBy: { requestedAt: "desc" },
    }),
    db.storageReconciliationRun.findFirst({
      where: { boothId: normalizedId },
      select: {
        id: true,
        status: true,
        trackedObjectCount: true,
        trackedBytes: true,
        reservedObjectCount: true,
        reservedBytes: true,
        untrackedObjectCount: true,
        untrackedBytes: true,
        missingObjectCount: true,
        sizeMismatchObjectCount: true,
        safeErrorCode: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    readSafeAuditRows(
      {
        OR: [
          { targetType: "BOOTH", targetId: normalizedId },
          { targetType: "QUOTA", targetId: normalizedId },
          { targetType: "STORAGE_RECONCILIATION", targetId: normalizedId },
        ],
      },
      { take: 12 },
    ),
  ]);
  if (!booth) return null;
  const quota = {
    maxTeamSeats: booth.quotaOverride?.maxTeamSeats ?? defaults.maxTeamSeats,
    maxProducts: booth.quotaOverride?.maxProducts ?? defaults.maxProducts,
    maxFaceboothProjects:
      booth.quotaOverride?.maxFaceboothProjects ??
      defaults.maxFaceboothProjects,
    maxStorageBytes: (
      booth.quotaOverride?.maxStorageBytes ?? defaults.maxStorageBytes
    ).toString(),
    configured: {
      maxTeamSeats: booth.quotaOverride?.maxTeamSeats ?? null,
      maxProducts: booth.quotaOverride?.maxProducts ?? null,
      maxFaceboothProjects: booth.quotaOverride?.maxFaceboothProjects ?? null,
      maxStorageBytes: booth.quotaOverride?.maxStorageBytes?.toString() ?? null,
      maxStorageMiB:
        booth.quotaOverride?.maxStorageBytes === null ||
        booth.quotaOverride?.maxStorageBytes === undefined
          ? null
          : (
              booth.quotaOverride.maxStorageBytes /
              (BigInt(1_024) * BigInt(1_024))
            ).toString(),
    },
    updatedAt: booth.quotaOverride?.updatedAt ?? null,
  };
  let countedStorageBytes = BigInt(0);
  const storage = storageGroups.map((group) => {
    const bytes = group._sum.byteLength ?? BigInt(0);
    if (
      TRACKED_STORAGE_STATES.includes(group.state as never) ||
      group.state === "RESERVED"
    ) {
      countedStorageBytes += bytes;
    }
    return {
      purpose: group.purpose,
      state: group.state,
      objectCount: group._count._all,
      byteLength: bytes.toString(),
    };
  });
  const usage = {
    activeTeamSeats: booth._count.memberships,
    pendingInvitations: booth._count.invitations,
    products: booth._count.products,
    faceboothProjects: booth._count.faceboothProjects,
    countedStorageBytes: countedStorageBytes.toString(),
  };
  return {
    id: booth.id,
    name: booth.name,
    slug: booth.slug,
    serviceState: booth.serviceState,
    publicationState: booth.status,
    serviceReason: booth.serviceReason
      ? redactPlatformInventoryText(booth.serviceReason)
      : null,
    serviceStateChangedAt: booth.serviceStateChangedAt,
    serviceVersion: booth.serviceVersion,
    createdAt: booth.createdAt,
    updatedAt: booth.updatedAt,
    owner: booth.owner,
    memberships: booth.memberships,
    usage,
    quota,
    overLimit: {
      teamSeats:
        usage.activeTeamSeats + usage.pendingInvitations > quota.maxTeamSeats,
      products: usage.products > quota.maxProducts,
      faceboothProjects: usage.faceboothProjects > quota.maxFaceboothProjects,
      storage:
        BigInt(usage.countedStorageBytes) > BigInt(quota.maxStorageBytes),
    },
    deletionBlockers: { retainedOrderReferences: booth._count.orders },
    deletionRequest,
    storage,
    storageAssets: storageAssets.map((asset) => {
      const objectName = asset.objectKey.split("/").at(-1) ?? "object";
      return {
        id: asset.id,
        safeObjectKey: `…/${objectName.slice(-36)}`,
        purpose: asset.purpose,
        state: asset.state,
        byteLength: asset.byteLength.toString(),
        createdAt: asset.createdAt,
        verifiedAt: asset.verifiedAt,
      };
    }),
    latestReconciliation: latestReconciliation
      ? {
          ...latestReconciliation,
          trackedBytes: latestReconciliation.trackedBytes.toString(),
          reservedBytes: latestReconciliation.reservedBytes.toString(),
          untrackedBytes: latestReconciliation.untrackedBytes.toString(),
        }
      : null,
    audit,
  };
}

export async function readPlatformStorage(
  access: PlatformAccessResult,
  input: { page?: unknown; search?: unknown },
  now = new Date(),
) {
  assertPlatformAccess(access, "platform.read");
  await expireStaleStorageReservations(undefined, now);
  const page = normalizePlatformPage(input.page);
  const search = normalizePlatformSearch(input.search);
  const where = boothSearchWhere(search);
  const [[booths, total], defaults, totals, configuredQuotaBytes] =
    await Promise.all([
      db.$transaction([
        db.booth.findMany({
          where,
          select: {
            id: true,
            name: true,
            slug: true,
            serviceState: true,
            quotaOverride: { select: { maxStorageBytes: true } },
          },
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * PLATFORM_INVENTORY_PAGE_SIZE,
          take: PLATFORM_INVENTORY_PAGE_SIZE,
        }),
        db.booth.count({ where }),
      ]),
      readQuotaDefaults(),
      readStorageCounts(now),
      readConfiguredStorageQuota(),
    ]);
  const boothIds = booths.map(({ id }) => id);
  const [usage, reconciliationRuns] = await Promise.all([
    readBoothStorageUsage(boothIds, now),
    boothIds.length
      ? db.storageReconciliationRun.findMany({
          where: { boothId: { in: boothIds } },
          select: {
            boothId: true,
            status: true,
            completedAt: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : [],
  ]);
  const latestRunByBooth = new Map<
    string,
    (typeof reconciliationRuns)[number]
  >();
  for (const run of reconciliationRuns) {
    if (!latestRunByBooth.has(run.boothId)) {
      latestRunByBooth.set(run.boothId, run);
    }
  }
  return {
    query: search,
    pagination: pagination(page, total, PLATFORM_INVENTORY_PAGE_SIZE),
    totals: { ...totals, configuredQuotaBytes },
    booths: booths.map((booth) => {
      const bytes = usage.get(booth.id) ?? {
        trackedBytes: BigInt(0),
        reservedBytes: BigInt(0),
        driftBytes: BigInt(0),
      };
      const run = latestRunByBooth.get(booth.id);
      return {
        id: booth.id,
        name: booth.name,
        slug: booth.slug,
        serviceState: booth.serviceState,
        trackedBytes: bytes.trackedBytes.toString(),
        reservedBytes: bytes.reservedBytes.toString(),
        driftBytes: bytes.driftBytes.toString(),
        quotaBytes: (
          booth.quotaOverride?.maxStorageBytes ?? defaults.maxStorageBytes
        ).toString(),
        lastReconciliationAt: run?.completedAt ?? run?.createdAt ?? null,
        lastReconciliationStatus: run?.status ?? null,
      };
    }),
  };
}

function normalizeAuditTargetType(value: unknown): AuditTargetType | "" {
  return typeof value === "string" &&
    AUDIT_TARGET_TYPES.includes(value as AuditTargetType)
    ? (value as AuditTargetType)
    : "";
}

function normalizeAuditDate(value: unknown, endOfDay: boolean) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

export async function readPlatformAudit(
  access: PlatformAccessResult,
  input: {
    page?: unknown;
    actor?: unknown;
    targetType?: unknown;
    targetId?: unknown;
    action?: unknown;
    from?: unknown;
    to?: unknown;
  },
) {
  assertPlatformAccess(access, "audit.read");
  const page = normalizePlatformPage(input.page);
  const filters = {
    actor: normalizePlatformSearch(input.actor),
    targetType: normalizeAuditTargetType(input.targetType),
    targetId: normalizePlatformSearch(input.targetId),
    action: normalizePlatformSearch(input.action),
    from: normalizeAuditDate(input.from, false),
    to: normalizeAuditDate(input.to, true),
  };
  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(filters.actor ? { actorUserId: filters.actor } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(filters.targetId ? { targetId: filters.targetId } : {}),
    ...(filters.action
      ? { action: { contains: filters.action, mode: "insensitive" } }
      : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
  const [total, audit] = await Promise.all([
    db.platformAuditLog.count({ where }),
    readSafeAuditRows(where, {
      skip: (page - 1) * PLATFORM_AUDIT_PAGE_SIZE,
      take: PLATFORM_AUDIT_PAGE_SIZE,
    }),
  ]);
  return {
    filters: {
      actor: filters.actor,
      targetType: filters.targetType,
      targetId: filters.targetId,
      action: filters.action,
      from: filters.from ? filters.from.toISOString().slice(0, 10) : "",
      to: filters.to ? filters.to.toISOString().slice(0, 10) : "",
    },
    pagination: pagination(page, total, PLATFORM_AUDIT_PAGE_SIZE),
    audit,
    targetTypes: AUDIT_TARGET_TYPES,
  };
}
