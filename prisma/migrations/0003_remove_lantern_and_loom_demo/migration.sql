-- Remove the retired Lantern & Loom demo booth and its persisted order data.
-- Booth-owned rows other than orders cascade from the Booth deletion.
DELETE FROM "Order"
WHERE "boothId" IN (
  SELECT "id"
  FROM "Booth"
  WHERE "slug" = 'lantern-and-loom'
);

DELETE FROM "Booth"
WHERE "slug" = 'lantern-and-loom';

-- Remove the seed-only owner when it has no remaining cross-booth references.
DELETE FROM "user" AS demo
WHERE demo."id" = 'demo-owner'
  AND demo."email" = 'demo-owner@cyfurden.local'
  AND NOT EXISTS (
    SELECT 1 FROM "Booth" WHERE "ownerId" = demo."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "BoothMembership" WHERE "userId" = demo."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "TeamInvitation"
    WHERE "invitedById" = demo."id" OR "acceptedById" = demo."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "StorefrontConfig" WHERE "updatedById" = demo."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Order" WHERE "confirmedById" = demo."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "AuditLog" WHERE "actorUserId" = demo."id"
  );
