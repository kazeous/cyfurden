import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma } from "../generated/prisma/client";
import { db } from "../lib/db";
import {
  createDefaultAcrylicStandeeDocument,
  createDefaultFaceboothSceneDocument,
} from "../lib/facebooth-documents";
import { readPublishedFaceboothBySlug } from "../lib/facebooth-public";
import {
  createFaceboothProject,
  deleteFaceboothProject,
  publishFaceboothSnapshot,
  saveFaceboothProject,
  unpublishFaceboothSnapshot,
} from "../lib/facebooth-projects";
import { createDefaultStorefrontDocument } from "../lib/storefront-document";

const enabled = process.env.CYFURDEN_PHASE15_INTEGRATION === "1";

test(
  "Phase 15E keeps public snapshots immutable, gated, and source-independent",
  { skip: !enabled },
  async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const ownerId = `phase15e-owner-${suffix}`;
    const slug = `phase15e-${suffix.slice(0, 16)}`;
    let boothId: string | null = null;

    try {
      await db.user.create({
        data: {
          id: ownerId,
          name: "Phase Fifteen E Owner",
          email: `phase15e-${suffix}@example.com`,
          emailVerified: true,
        },
      });
      const booth = await db.booth.create({
        data: {
          slug,
          name: "Phase Fifteen E Booth",
          status: "PUBLISHED",
          ownerId,
          memberships: {
            create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
      boothId = booth.id;
      const storefrontDocument = createDefaultStorefrontDocument(booth.name);
      await db.storefrontConfig.create({
        data: {
          boothId,
          draftDocument: storefrontDocument,
          publishedDocument: storefrontDocument,
          publishedAt: new Date(),
          updatedById: ownerId,
        },
      });

      const merchDocument = createDefaultAcrylicStandeeDocument();
      const sceneDocument = createDefaultFaceboothSceneDocument();
      const merch = await createFaceboothProject({
        boothId,
        actorUserId: ownerId,
        project: {
          name: "Snapshot standee",
          kind: "MERCH",
          document: merchDocument,
        },
      });
      const scene = await createFaceboothProject({
        boothId,
        actorUserId: ownerId,
        project: {
          name: "Snapshot booth v1",
          kind: "SCENE",
          document: sceneDocument,
        },
      });
      if (merch.kind !== "created" || scene.kind !== "created") {
        assert.fail("Facebooth fixtures");
      }

      const published = await publishFaceboothSnapshot({
        boothId,
        actorUserId: ownerId,
        publication: {
          sceneProjectId: scene.project.id,
          merchProjectIds: [merch.project.id],
        },
      });
      assert.equal(published.kind, "published");
      const firstPublic = await readPublishedFaceboothBySlug(slug);
      assert.equal(firstPublic?.revision, 1);
      assert.equal(firstPublic?.publication.scene.name, "Snapshot booth v1");

      const privateEdit = await saveFaceboothProject({
        boothId,
        projectId: scene.project.id,
        actorUserId: ownerId,
        project: {
          expectedEditVersion: 1,
          name: "Snapshot booth v2 private",
          document: {
            ...sceneDocument,
            footprintMm: {
              ...sceneDocument.footprintMm,
              width: 3_600,
            },
          },
        },
      });
      assert.equal(privateEdit.kind, "saved");
      const unchangedPublic = await readPublishedFaceboothBySlug(slug);
      assert.equal(unchangedPublic?.revision, 1);
      assert.equal(
        unchangedPublic?.publication.scene.document.footprintMm.width,
        3_000,
      );

      const republished = await publishFaceboothSnapshot({
        boothId,
        actorUserId: ownerId,
        publication: {
          sceneProjectId: scene.project.id,
          merchProjectIds: [merch.project.id],
        },
      });
      assert.equal(republished.kind, "published");
      const updatedPublic = await readPublishedFaceboothBySlug(slug);
      assert.equal(updatedPublic?.revision, 2);
      assert.equal(
        updatedPublic?.publication.scene.document.footprintMm.width,
        3_600,
      );

      assert.equal(
        (
          await deleteFaceboothProject({
            boothId,
            projectId: scene.project.id,
            actorUserId: ownerId,
          })
        ).kind,
        "deleted",
      );
      assert.equal(
        (
          await deleteFaceboothProject({
            boothId,
            projectId: merch.project.id,
            actorUserId: ownerId,
          })
        ).kind,
        "deleted",
      );
      const afterSourceDeletion = await readPublishedFaceboothBySlug(slug);
      assert.equal(afterSourceDeletion?.revision, 2);
      assert.equal(afterSourceDeletion?.publication.merch.length, 1);

      await db.booth.update({
        where: { id: boothId },
        data: { status: "DRAFT" },
      });
      assert.equal(await readPublishedFaceboothBySlug(slug), null);
      await db.booth.update({
        where: { id: boothId },
        data: { status: "PUBLISHED" },
      });
      await db.storefrontConfig.update({
        where: { boothId },
        data: { publishedDocument: Prisma.DbNull, publishedAt: null },
      });
      assert.equal(await readPublishedFaceboothBySlug(slug), null);
      await db.storefrontConfig.update({
        where: { boothId },
        data: {
          publishedDocument: storefrontDocument,
          publishedAt: new Date(),
        },
      });

      const unpublished = await unpublishFaceboothSnapshot({
        boothId,
        actorUserId: ownerId,
      });
      assert.equal(unpublished.kind, "unpublished");
      assert.equal(await readPublishedFaceboothBySlug(slug), null);
      assert.equal(
        await db.auditLog.count({
          where: {
            boothId,
            action: "facebooth.publication_unpublished",
          },
        }),
        1,
      );
    } finally {
      if (boothId) await db.booth.deleteMany({ where: { id: boothId } });
      await db.user.deleteMany({ where: { id: ownerId } });
    }
  },
);
