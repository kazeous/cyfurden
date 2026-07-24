-- Repair any legacy or manually drifted owner roles before enforcing the
-- one-owner and non-owner-invitation invariants.
UPDATE "BoothMembership" AS membership
SET
  "role" = 'ADMIN',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Booth" AS booth
WHERE membership."boothId" = booth."id"
  AND membership."role" = 'OWNER'
  AND membership."userId" <> booth."ownerId";

INSERT INTO "BoothMembership" (
  "id",
  "boothId",
  "userId",
  "role",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  'owner-membership-' || booth."id",
  booth."id",
  booth."ownerId",
  'OWNER',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Booth" AS booth
ON CONFLICT ("boothId", "userId")
DO UPDATE SET
  "role" = 'OWNER',
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP;

-- OWNER invitations were never a supported product flow. Revoke any pending
-- drifted rows and retain historical records as ADMIN invitations.
UPDATE "TeamInvitation"
SET
  "role" = 'ADMIN',
  "status" = CASE
    WHEN "status" = 'PENDING' THEN 'REVOKED'::"InvitationStatus"
    ELSE "status"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" = 'OWNER';

CREATE UNIQUE INDEX "BoothMembership_one_owner_per_booth"
ON "BoothMembership"("boothId")
WHERE "role" = 'OWNER';

ALTER TABLE "TeamInvitation"
ADD CONSTRAINT "TeamInvitation_non_owner_role_check"
CHECK ("role" IN ('ADMIN', 'STAFF'));
