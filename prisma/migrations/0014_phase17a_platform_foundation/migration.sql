-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM (
  'PLATFORM_VIEWER',
  'PLATFORM_OPERATOR',
  'PLATFORM_SUPER_ADMIN'
);

-- CreateEnum
CREATE TYPE "PlatformGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "BoothServiceState" AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'DELETION_PENDING'
);

-- CreateEnum
CREATE TYPE "PlatformAuditTargetType" AS ENUM (
  'PLATFORM',
  'USER',
  'BOOTH',
  'MEMBERSHIP',
  'PLATFORM_ROLE_GRANT',
  'QUOTA',
  'STORAGE_ASSET',
  'STORAGE_RECONCILIATION',
  'DELETION_REQUEST'
);

-- CreateEnum
CREATE TYPE "PlatformDeletionTargetType" AS ENUM ('USER', 'BOOTH');

-- CreateEnum
CREATE TYPE "PlatformDeletionState" AS ENUM (
  'PENDING',
  'CANCELLED',
  'FINALIZING',
  'COMPLETED',
  'BLOCKED'
);

-- CreateEnum
CREATE TYPE "StorageAssetPurpose" AS ENUM (
  'BOOTH_LOGO',
  'PAYMENT_QR',
  'PRODUCT_IMAGE',
  'FACEBOOTH_ARTWORK',
  'FACEBOOTH_PREVIEW'
);

-- CreateEnum
CREATE TYPE "StorageAssetState" AS ENUM (
  'RESERVED',
  'VERIFIED',
  'DETACHED',
  'DELETION_PENDING',
  'DELETED',
  'MISSING',
  'ORPHANED'
);

-- CreateEnum
CREATE TYPE "StorageReconciliationStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

-- Better Auth admin/session and TOTP fields
ALTER TABLE "user"
ADD COLUMN "role" TEXT DEFAULT 'user',
ADD COLUMN "banned" BOOLEAN DEFAULT false,
ADD COLUMN "banReason" TEXT,
ADD COLUMN "banExpires" TIMESTAMP(3),
ADD COLUMN "twoFactorEnabled" BOOLEAN DEFAULT false;

ALTER TABLE "session"
ADD COLUMN "impersonatedBy" TEXT,
ADD COLUMN "platformAuthenticatedAt" TIMESTAMP(3);

-- Booth publication state remains separate from service enforcement state.
ALTER TABLE "Booth"
ADD COLUMN "serviceState" "BoothServiceState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "serviceReason" TEXT,
ADD COLUMN "serviceStateChangedByUserId" TEXT,
ADD COLUMN "serviceStateChangedAt" TIMESTAMP(3),
ADD COLUMN "serviceVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "twoFactor" (
  "id" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),

  CONSTRAINT "twoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRoleGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "status" "PlatformGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedByUserId" TEXT NOT NULL,
  "grantReason" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedByUserId" TEXT,
  "revokeReason" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformRoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
  "id" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" "PlatformAuditTargetType" NOT NULL,
  "targetId" TEXT,
  "reason" TEXT NOT NULL,
  "beforeMetadata" JSONB,
  "afterMetadata" JSONB,
  "correlationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformDeletionRequest" (
  "id" TEXT NOT NULL,
  "targetType" "PlatformDeletionTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "state" "PlatformDeletionState" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "coolingOffEndsAt" TIMESTAMP(3) NOT NULL,
  "blockers" JSONB,
  "cancelledByUserId" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "finalizedByUserId" TEXT,
  "finalizedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformQuotaDefault" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "maxOwnedBooths" INTEGER NOT NULL DEFAULT 5,
  "maxTeamSeats" INTEGER NOT NULL DEFAULT 10,
  "maxProducts" INTEGER NOT NULL DEFAULT 500,
  "maxFaceboothProjects" INTEGER NOT NULL DEFAULT 100,
  "maxStorageBytes" BIGINT NOT NULL DEFAULT 5368709120,
  "updatedByUserId" TEXT,
  "updateReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformQuotaDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserQuotaOverride" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "maxOwnedBooths" INTEGER NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserQuotaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoothQuotaOverride" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "maxTeamSeats" INTEGER,
  "maxProducts" INTEGER,
  "maxFaceboothProjects" INTEGER,
  "maxStorageBytes" BIGINT,
  "updatedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BoothQuotaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageAsset" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "purpose" "StorageAssetPurpose" NOT NULL,
  "byteLength" BIGINT NOT NULL,
  "verifiedMime" TEXT,
  "state" "StorageAssetState" NOT NULL DEFAULT 'RESERVED',
  "associatedRecordType" TEXT,
  "associatedRecordId" TEXT,
  "reservationExpiresAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "detachedAt" TIMESTAMP(3),
  "deletionRequestedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletionAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastDeletionErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageReconciliationRun" (
  "id" TEXT NOT NULL,
  "boothId" TEXT NOT NULL,
  "status" "StorageReconciliationStatus" NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" TEXT NOT NULL,
  "providerCursor" TEXT,
  "trackedObjectCount" INTEGER NOT NULL DEFAULT 0,
  "trackedBytes" BIGINT NOT NULL DEFAULT 0,
  "reservedObjectCount" INTEGER NOT NULL DEFAULT 0,
  "reservedBytes" BIGINT NOT NULL DEFAULT 0,
  "untrackedObjectCount" INTEGER NOT NULL DEFAULT 0,
  "untrackedBytes" BIGINT NOT NULL DEFAULT 0,
  "missingObjectCount" INTEGER NOT NULL DEFAULT 0,
  "sizeMismatchObjectCount" INTEGER NOT NULL DEFAULT 0,
  "safeErrorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorageReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booth_serviceState_idx" ON "Booth"("serviceState");

CREATE UNIQUE INDEX "twoFactor_userId_key" ON "twoFactor"("userId");
CREATE INDEX "twoFactor_secret_idx" ON "twoFactor"("secret");

CREATE UNIQUE INDEX "PlatformRoleGrant_userId_key"
ON "PlatformRoleGrant"("userId");
CREATE INDEX "PlatformRoleGrant_role_status_idx"
ON "PlatformRoleGrant"("role", "status");
CREATE INDEX "PlatformRoleGrant_grantedByUserId_idx"
ON "PlatformRoleGrant"("grantedByUserId");

CREATE INDEX "PlatformAuditLog_createdAt_idx"
ON "PlatformAuditLog"("createdAt" DESC);
CREATE INDEX "PlatformAuditLog_actorUserId_createdAt_idx"
ON "PlatformAuditLog"("actorUserId", "createdAt" DESC);
CREATE INDEX "PlatformAuditLog_targetType_targetId_createdAt_idx"
ON "PlatformAuditLog"("targetType", "targetId", "createdAt" DESC);
CREATE INDEX "PlatformAuditLog_correlationId_idx"
ON "PlatformAuditLog"("correlationId");

CREATE INDEX "PlatformDeletionRequest_targetType_targetId_state_idx"
ON "PlatformDeletionRequest"("targetType", "targetId", "state");
CREATE INDEX "PlatformDeletionRequest_state_coolingOffEndsAt_idx"
ON "PlatformDeletionRequest"("state", "coolingOffEndsAt");
CREATE UNIQUE INDEX "PlatformDeletionRequest_one_open_target_key"
ON "PlatformDeletionRequest"("targetType", "targetId")
WHERE "state" IN ('PENDING', 'FINALIZING', 'BLOCKED');

CREATE UNIQUE INDEX "UserQuotaOverride_userId_key"
ON "UserQuotaOverride"("userId");
CREATE INDEX "UserQuotaOverride_updatedByUserId_idx"
ON "UserQuotaOverride"("updatedByUserId");

CREATE UNIQUE INDEX "BoothQuotaOverride_boothId_key"
ON "BoothQuotaOverride"("boothId");
CREATE INDEX "BoothQuotaOverride_updatedByUserId_idx"
ON "BoothQuotaOverride"("updatedByUserId");

CREATE UNIQUE INDEX "StorageAsset_objectKey_key"
ON "StorageAsset"("objectKey");
CREATE INDEX "StorageAsset_boothId_state_idx"
ON "StorageAsset"("boothId", "state");
CREATE INDEX "StorageAsset_boothId_purpose_state_idx"
ON "StorageAsset"("boothId", "purpose", "state");
CREATE INDEX "StorageAsset_state_reservationExpiresAt_idx"
ON "StorageAsset"("state", "reservationExpiresAt");
CREATE INDEX "StorageAsset_associatedRecordType_associatedRecordId_idx"
ON "StorageAsset"("associatedRecordType", "associatedRecordId");

CREATE INDEX "StorageReconciliationRun_boothId_createdAt_idx"
ON "StorageReconciliationRun"("boothId", "createdAt" DESC);
CREATE INDEX "StorageReconciliationRun_status_createdAt_idx"
ON "StorageReconciliationRun"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "twoFactor"
ADD CONSTRAINT "twoFactor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformRoleGrant"
ADD CONSTRAINT "PlatformRoleGrant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserQuotaOverride"
ADD CONSTRAINT "UserQuotaOverride_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoothQuotaOverride"
ADD CONSTRAINT "BoothQuotaOverride_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorageAsset"
ADD CONSTRAINT "StorageAsset_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StorageReconciliationRun"
ADD CONSTRAINT "StorageReconciliationRun_boothId_fkey"
FOREIGN KEY ("boothId") REFERENCES "Booth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Bounded invariants for the Phase 17 contracts.
ALTER TABLE "user"
ADD CONSTRAINT "user_platform_role_check"
CHECK (
  "role" IS NULL OR "role" IN (
    'user',
    'PLATFORM_VIEWER',
    'PLATFORM_OPERATOR',
    'PLATFORM_SUPER_ADMIN'
  )
);

ALTER TABLE "twoFactor"
ADD CONSTRAINT "twoFactor_failed_verification_count_check"
CHECK ("failedVerificationCount" >= 0);

ALTER TABLE "Booth"
ADD CONSTRAINT "Booth_service_version_check"
CHECK ("serviceVersion" >= 1),
ADD CONSTRAINT "Booth_service_reason_check"
CHECK (
  "serviceReason" IS NULL OR (
    char_length(btrim("serviceReason")) BETWEEN 1 AND 500
  )
);

ALTER TABLE "PlatformRoleGrant"
ADD CONSTRAINT "PlatformRoleGrant_grant_reason_check"
CHECK (char_length(btrim("grantReason")) BETWEEN 1 AND 500),
ADD CONSTRAINT "PlatformRoleGrant_revocation_state_check"
CHECK (
  (
    "status" = 'ACTIVE'
    AND "revokedAt" IS NULL
    AND "revokedByUserId" IS NULL
    AND "revokeReason" IS NULL
  ) OR (
    "status" = 'REVOKED'
    AND "revokedAt" IS NOT NULL
    AND "revokedByUserId" IS NOT NULL
    AND char_length(btrim("revokeReason")) BETWEEN 1 AND 500
  )
);

ALTER TABLE "PlatformAuditLog"
ADD CONSTRAINT "PlatformAuditLog_action_check"
CHECK (char_length(btrim("action")) BETWEEN 1 AND 120),
ADD CONSTRAINT "PlatformAuditLog_target_id_check"
CHECK ("targetId" IS NULL OR char_length("targetId") BETWEEN 1 AND 240),
ADD CONSTRAINT "PlatformAuditLog_reason_check"
CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
ADD CONSTRAINT "PlatformAuditLog_correlation_id_check"
CHECK (char_length("correlationId") BETWEEN 1 AND 120),
ADD CONSTRAINT "PlatformAuditLog_before_metadata_size_check"
CHECK (
  "beforeMetadata" IS NULL
  OR octet_length("beforeMetadata"::text) <= 16384
),
ADD CONSTRAINT "PlatformAuditLog_after_metadata_size_check"
CHECK (
  "afterMetadata" IS NULL
  OR octet_length("afterMetadata"::text) <= 16384
);

ALTER TABLE "PlatformDeletionRequest"
ADD CONSTRAINT "PlatformDeletionRequest_target_id_check"
CHECK (char_length("targetId") BETWEEN 1 AND 240),
ADD CONSTRAINT "PlatformDeletionRequest_reason_check"
CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500),
ADD CONSTRAINT "PlatformDeletionRequest_cooling_off_check"
CHECK ("coolingOffEndsAt" >= "requestedAt" + INTERVAL '7 days'),
ADD CONSTRAINT "PlatformDeletionRequest_terminal_state_check"
CHECK (
  ("state" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL)
  OR ("state" = 'COMPLETED' AND "finalizedAt" IS NOT NULL AND "finalizedByUserId" IS NOT NULL)
  OR "state" IN ('PENDING', 'FINALIZING', 'BLOCKED')
);

ALTER TABLE "PlatformQuotaDefault"
ADD CONSTRAINT "PlatformQuotaDefault_singleton_check"
CHECK ("id" = 'global'),
ADD CONSTRAINT "PlatformQuotaDefault_positive_values_check"
CHECK (
  "maxOwnedBooths" >= 1
  AND "maxTeamSeats" >= 1
  AND "maxProducts" >= 1
  AND "maxFaceboothProjects" >= 1
  AND "maxStorageBytes" >= 1
),
ADD CONSTRAINT "PlatformQuotaDefault_update_reason_check"
CHECK (
  ("updatedByUserId" IS NULL AND "updateReason" IS NULL)
  OR (
    "updatedByUserId" IS NOT NULL
    AND char_length(btrim("updateReason")) BETWEEN 1 AND 500
  )
);

ALTER TABLE "UserQuotaOverride"
ADD CONSTRAINT "UserQuotaOverride_value_check"
CHECK ("maxOwnedBooths" >= 1),
ADD CONSTRAINT "UserQuotaOverride_reason_check"
CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500);

ALTER TABLE "BoothQuotaOverride"
ADD CONSTRAINT "BoothQuotaOverride_has_value_check"
CHECK (
  "maxTeamSeats" IS NOT NULL
  OR "maxProducts" IS NOT NULL
  OR "maxFaceboothProjects" IS NOT NULL
  OR "maxStorageBytes" IS NOT NULL
),
ADD CONSTRAINT "BoothQuotaOverride_positive_values_check"
CHECK (
  ("maxTeamSeats" IS NULL OR "maxTeamSeats" >= 1)
  AND ("maxProducts" IS NULL OR "maxProducts" >= 1)
  AND ("maxFaceboothProjects" IS NULL OR "maxFaceboothProjects" >= 1)
  AND ("maxStorageBytes" IS NULL OR "maxStorageBytes" >= 1)
),
ADD CONSTRAINT "BoothQuotaOverride_reason_check"
CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500);

ALTER TABLE "StorageAsset"
ADD CONSTRAINT "StorageAsset_object_key_check"
CHECK (
  char_length("objectKey") BETWEEN 1 AND 1024
  AND "objectKey" LIKE 'booths/' || "boothId" || '/%'
),
ADD CONSTRAINT "StorageAsset_byte_length_check"
CHECK ("byteLength" >= 1),
ADD CONSTRAINT "StorageAsset_deletion_attempts_check"
CHECK ("deletionAttempts" >= 0),
ADD CONSTRAINT "StorageAsset_reservation_expiry_check"
CHECK ("state" <> 'RESERVED' OR "reservationExpiresAt" IS NOT NULL),
ADD CONSTRAINT "StorageAsset_verified_fields_check"
CHECK (
  "state" NOT IN ('VERIFIED', 'DETACHED', 'DELETION_PENDING')
  OR (
    "verifiedAt" IS NOT NULL
    AND "verifiedMime" IS NOT NULL
    AND char_length("verifiedMime") BETWEEN 1 AND 120
  )
),
ADD CONSTRAINT "StorageAsset_deleted_state_check"
CHECK ("state" <> 'DELETED' OR "deletedAt" IS NOT NULL);

ALTER TABLE "StorageReconciliationRun"
ADD CONSTRAINT "StorageReconciliationRun_nonnegative_totals_check"
CHECK (
  "trackedObjectCount" >= 0
  AND "trackedBytes" >= 0
  AND "reservedObjectCount" >= 0
  AND "reservedBytes" >= 0
  AND "untrackedObjectCount" >= 0
  AND "untrackedBytes" >= 0
  AND "missingObjectCount" >= 0
  AND "sizeMismatchObjectCount" >= 0
),
ADD CONSTRAINT "StorageReconciliationRun_completed_state_check"
CHECK (
  "status" NOT IN ('COMPLETED', 'FAILED') OR "completedAt" IS NOT NULL
);

-- Platform audit is append-only even for direct database callers.
CREATE FUNCTION "reject_platform_audit_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformAuditLog_append_only_update"
BEFORE UPDATE ON "PlatformAuditLog"
FOR EACH ROW EXECUTE FUNCTION "reject_platform_audit_mutation"();

CREATE TRIGGER "PlatformAuditLog_append_only_delete"
BEFORE DELETE ON "PlatformAuditLog"
FOR EACH ROW EXECUTE FUNCTION "reject_platform_audit_mutation"();

-- Seed the approved typed global defaults. Runtime enforcement begins in 17D.
INSERT INTO "PlatformQuotaDefault" (
  "id",
  "maxOwnedBooths",
  "maxTeamSeats",
  "maxProducts",
  "maxFaceboothProjects",
  "maxStorageBytes",
  "createdAt",
  "updatedAt"
) VALUES (
  'global',
  5,
  10,
  500,
  100,
  5368709120,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
