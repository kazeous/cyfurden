import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db } from "../lib/db";
import {
  createDefaultAcrylicStandeeDocument,
  createDefaultFaceboothSceneDocument,
} from "../lib/facebooth-documents";
import {
  createFaceboothProject,
  listFaceboothProjectsForManager,
  publishFaceboothSnapshot,
  readFaceboothProjectForManager,
  saveFaceboothProject,
} from "../lib/facebooth-projects";
import { buildBoothUploadObjectKey } from "../lib/oracle-presign-contract";

const enabled = process.env.CYFURDEN_PHASE15_INTEGRATION === "1";

test(
  "Phase 15A integrates migration, project access, optimistic saves, and snapshots",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase15-owner-${suffix}`;
    const adminId = `phase15-admin-${suffix}`;
    const staffId = `phase15-staff-${suffix}`;
    const strangerId = `phase15-stranger-${suffix}`;
    let boothId: string | null = null;
    let secondBoothId: string | null = null;

    try {
      await db.user.createMany({
        data: [
          {
            id: ownerId,
            name: "Phase Fifteen Owner",
            email: `phase15-owner-${suffix}@example.com`,
            emailVerified: true,
          },
          {
            id: adminId,
            name: "Phase Fifteen Admin",
            email: `phase15-admin-${suffix}@example.com`,
            emailVerified: true,
          },
          {
            id: staffId,
            name: "Phase Fifteen Staff",
            email: `phase15-staff-${suffix}@example.com`,
            emailVerified: true,
          },
          {
            id: strangerId,
            name: "Phase Fifteen Stranger",
            email: `phase15-stranger-${suffix}@example.com`,
            emailVerified: true,
          },
        ],
      });
      const booth = await db.booth.create({
        data: {
          slug: `phase15-${suffix.slice(0, 16)}`,
          name: "Phase Fifteen Booth",
          ownerId,
          memberships: {
            create: [
              { userId: ownerId, role: "OWNER", status: "ACTIVE" },
              { userId: adminId, role: "ADMIN", status: "ACTIVE" },
              { userId: staffId, role: "STAFF", status: "ACTIVE" },
            ],
          },
        },
      });
      boothId = booth.id;
      const secondBooth = await db.booth.create({
        data: {
          slug: `phase15-other-${suffix.slice(0, 16)}`,
          name: "Phase Fifteen Other Booth",
          ownerId,
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      secondBoothId = secondBooth.id;

      const appliedMigration = await db.$queryRaw<
        Array<{ finished_at: Date | null; migration_name: string }>
      >`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE migration_name = '0013_phase15a_facebooth_foundation'
      `;
      assert.equal(appliedMigration.length, 1);
      assert.ok(appliedMigration[0]?.finished_at);

      const constraints = await db.$queryRaw<Array<{ conname: string }>>`
        SELECT conname
        FROM pg_constraint
        WHERE conname LIKE 'FaceboothProject_%_check'
           OR conname LIKE 'FaceboothPublication_%_check'
        ORDER BY conname
      `;
      assert.deepEqual(
        constraints.map(({ conname }) => conname),
        [
          "FaceboothProject_edit_version_check",
          "FaceboothProject_name_check",
          "FaceboothProject_preview_key_check",
          "FaceboothProject_schema_version_check",
          "FaceboothPublication_preview_key_check",
          "FaceboothPublication_revision_check",
          "FaceboothPublication_schema_version_check",
        ],
      );

      const merchDocument = createDefaultAcrylicStandeeDocument();
      const sceneDocument = createDefaultFaceboothSceneDocument();
      const ownerMerch = await createFaceboothProject({
        boothId,
        actorUserId: ownerId,
        project: {
          name: "Owner standee",
          kind: "MERCH",
          document: merchDocument,
        },
      });
      assert.equal(ownerMerch.kind, "created");
      if (ownerMerch.kind !== "created") assert.fail("owner merch creation");
      assert.equal(ownerMerch.project.createdById, ownerId);
      assert.equal(ownerMerch.project.updatedById, ownerId);
      assert.equal(ownerMerch.project.editVersion, 1);

      const adminScene = await createFaceboothProject({
        boothId,
        actorUserId: adminId,
        project: {
          name: "Admin booth scene",
          kind: "SCENE",
          document: sceneDocument,
        },
      });
      assert.equal(adminScene.kind, "created");
      if (adminScene.kind !== "created") assert.fail("admin scene creation");
      assert.equal(adminScene.project.createdById, adminId);

      const countBeforeRejectedCreates = await db.faceboothProject.count({
        where: { boothId },
      });
      for (const actorUserId of [staffId, strangerId]) {
        const rejected = await createFaceboothProject({
          boothId,
          actorUserId,
          project: {
            name: "Rejected project",
            kind: "MERCH",
            document: merchDocument,
          },
        });
        assert.equal(rejected.kind, "forbidden");
      }
      assert.equal(
        await db.faceboothProject.count({ where: { boothId } }),
        countBeforeRejectedCreates,
      );

      const adminSave = await saveFaceboothProject({
        boothId,
        projectId: ownerMerch.project.id,
        actorUserId: adminId,
        project: {
          expectedEditVersion: 1,
          name: "Admin-updated standee",
          document: {
            ...merchDocument,
            sizeMm: { ...merchDocument.sizeMm, width: 125 },
          },
        },
      });
      assert.equal(adminSave.kind, "saved");
      if (adminSave.kind !== "saved") assert.fail("admin merch save");
      assert.equal(adminSave.project.editVersion, 2);
      assert.equal(adminSave.project.updatedById, adminId);

      const staleSave = await saveFaceboothProject({
        boothId,
        projectId: ownerMerch.project.id,
        actorUserId: ownerId,
        project: {
          expectedEditVersion: 1,
          name: "Stale overwrite",
          document: merchDocument,
        },
      });
      assert.deepEqual(staleSave, {
        kind: "conflict",
        expectedEditVersion: 1,
        currentEditVersion: 2,
      });
      const afterStale = await db.faceboothProject.findUniqueOrThrow({
        where: { id: ownerMerch.project.id },
        select: { editVersion: true, name: true, updatedById: true },
      });
      assert.deepEqual(afterStale, {
        editVersion: 2,
        name: "Admin-updated standee",
        updatedById: adminId,
      });

      const ownerSceneSave = await saveFaceboothProject({
        boothId,
        projectId: adminScene.project.id,
        actorUserId: ownerId,
        project: {
          expectedEditVersion: 1,
          name: "Owner-updated booth scene",
          document: {
            ...sceneDocument,
            footprintMm: { ...sceneDocument.footprintMm, width: 3_500 },
          },
        },
      });
      assert.equal(ownerSceneSave.kind, "saved");

      const malformedSave = await saveFaceboothProject({
        boothId,
        projectId: ownerMerch.project.id,
        actorUserId: ownerId,
        project: {
          expectedEditVersion: 2,
          name: "Malformed standee",
          document: {
            ...merchDocument,
            sizeMm: { ...merchDocument.sizeMm, width: 100.5 },
          },
        },
      });
      assert.equal(malformedSave.kind, "invalid");
      assert.equal(
        await db.faceboothProject.count({
          where: { id: ownerMerch.project.id, editVersion: 2 },
        }),
        1,
      );

      for (const actorUserId of [staffId, strangerId]) {
        const read = await readFaceboothProjectForManager({
          boothId,
          projectId: ownerMerch.project.id,
          actorUserId,
        });
        assert.equal(read.kind, "forbidden");
        const save = await saveFaceboothProject({
          boothId,
          projectId: ownerMerch.project.id,
          actorUserId,
          project: {
            expectedEditVersion: 2,
            name: "Rejected save",
            document: merchDocument,
          },
        });
        assert.equal(save.kind, "forbidden");
      }

      const crossBoothRead = await readFaceboothProjectForManager({
        boothId: secondBooth.id,
        projectId: ownerMerch.project.id,
        actorUserId: ownerId,
      });
      assert.equal(crossBoothRead.kind, "missing");
      const crossBoothSave = await saveFaceboothProject({
        boothId: secondBooth.id,
        projectId: ownerMerch.project.id,
        actorUserId: ownerId,
        project: {
          expectedEditVersion: 2,
          name: "Cross-booth overwrite",
          document: merchDocument,
        },
      });
      assert.equal(crossBoothSave.kind, "missing");

      const otherMerch = await createFaceboothProject({
        boothId: secondBooth.id,
        actorUserId: ownerId,
        project: {
          name: "Other booth standee",
          kind: "MERCH",
          document: merchDocument,
        },
      });
      assert.equal(otherMerch.kind, "created");
      if (otherMerch.kind !== "created") assert.fail("other merch creation");
      const crossProjectScene = {
        ...sceneDocument,
        merchSnapshots: [
          {
            id: "snapshot-other",
            sourceProjectId: otherMerch.project.id,
            sourceEditVersion: 1,
            name: otherMerch.project.name,
            document: merchDocument,
          },
        ],
      };
      const rejectedCrossProject = await createFaceboothProject({
        boothId,
        actorUserId: ownerId,
        project: {
          name: "Cross-booth scene",
          kind: "SCENE",
          document: crossProjectScene,
        },
      });
      assert.equal(rejectedCrossProject.kind, "invalid-references");

      const otherArtworkKey = buildBoothUploadObjectKey({
        boothId: secondBooth.id,
        purpose: "facebooth-artwork",
        contentType: "image/png",
      });
      const rejectedCrossAsset = await createFaceboothProject({
        boothId,
        actorUserId: ownerId,
        project: {
          name: "Cross-booth artwork",
          kind: "MERCH",
          document: {
            ...merchDocument,
            artwork: {
              objectKey: otherArtworkKey,
              contentType: "image/png",
              pixelWidth: 1_000,
              pixelHeight: 1_500,
              contourPoints: null,
              opaqueFallback: true,
            },
          },
        },
      });
      assert.equal(rejectedCrossAsset.kind, "invalid-assets");

      const projects = await listFaceboothProjectsForManager({
        boothId,
        actorUserId: adminId,
      });
      assert.equal(projects.kind, "found");
      if (projects.kind !== "found") assert.fail("manager project list");
      assert.deepEqual(
        new Set(projects.projects.map((project) => project.kind)),
        new Set(["MERCH", "SCENE"]),
      );

      const published = await publishFaceboothSnapshot({
        boothId,
        actorUserId: ownerId,
        publication: {
          sceneProjectId: adminScene.project.id,
          merchProjectIds: [ownerMerch.project.id],
          previewObjectKey: null,
        },
      });
      assert.equal(published.kind, "published");
      if (published.kind !== "published") assert.fail("owner publication");
      assert.equal(published.publication.revision, 1);
      assert.equal(published.publication.publishedById, ownerId);

      const republished = await publishFaceboothSnapshot({
        boothId,
        actorUserId: adminId,
        publication: {
          sceneProjectId: adminScene.project.id,
          merchProjectIds: [ownerMerch.project.id],
          previewObjectKey: null,
        },
      });
      assert.equal(republished.kind, "published");
      if (republished.kind !== "published") assert.fail("admin publication");
      assert.equal(republished.publication.revision, 2);
      assert.equal(republished.publication.publishedById, adminId);

      const staffPublication = await publishFaceboothSnapshot({
        boothId,
        actorUserId: staffId,
        publication: {
          sceneProjectId: adminScene.project.id,
          merchProjectIds: [],
          previewObjectKey: null,
        },
      });
      assert.equal(staffPublication.kind, "forbidden");
      assert.equal(
        await db.faceboothPublication.count({
          where: { boothId, revision: 2 },
        }),
        1,
      );

      const crossPublication = await publishFaceboothSnapshot({
        boothId,
        actorUserId: ownerId,
        publication: {
          sceneProjectId: adminScene.project.id,
          merchProjectIds: [otherMerch.project.id],
          previewObjectKey: null,
        },
      });
      assert.equal(crossPublication.kind, "invalid-references");

      await assert.rejects(
        db.$executeRaw`
          UPDATE "FaceboothProject"
          SET "editVersion" = 0
          WHERE "id" = ${ownerMerch.project.id}
        `,
      );
      assert.equal(
        await db.faceboothProject.count({
          where: { id: ownerMerch.project.id, editVersion: 2 },
        }),
        1,
      );

      const auditActors = await db.auditLog.findMany({
        where: {
          boothId,
          entityType: { in: ["FaceboothProject", "FaceboothPublication"] },
        },
        select: { action: true, actorUserId: true },
      });
      assert.ok(
        auditActors.some(
          (audit) =>
            audit.action === "facebooth.project_created" &&
            audit.actorUserId === ownerId,
        ),
      );
      assert.ok(
        auditActors.some(
          (audit) =>
            audit.action === "facebooth.project_saved" &&
            audit.actorUserId === adminId,
        ),
      );
      assert.ok(
        auditActors.some(
          (audit) =>
            audit.action === "facebooth.publication_published" &&
            audit.actorUserId === adminId,
        ),
      );
    } finally {
      if (boothId || secondBoothId) {
        await db.booth.deleteMany({
          where: {
            id: { in: [boothId, secondBoothId].filter(Boolean) as string[] },
          },
        });
      }
      await db.user.deleteMany({
        where: { id: { in: [ownerId, adminId, staffId, strangerId] } },
      });
    }
  },
);
