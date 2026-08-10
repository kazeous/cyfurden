import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  collectFaceboothArtworkObjectKeys,
  faceboothDocumentByteLength,
  faceboothSceneDocumentSchema,
  faceboothProjectKinds,
  faceboothProjectNameSchema,
  faceboothPublicationDocumentSchema,
  FACEBOOTH_DOCUMENT_MAX_BYTES,
  FACEBOOTH_DOCUMENT_VERSION,
  parseFaceboothProjectDocument,
  type FaceboothProjectDocument,
  type FaceboothProjectKind,
  type FaceboothPublicationDocument,
  type FaceboothSceneDocument,
} from "@/lib/facebooth-documents";
import { isBoothFaceboothObjectKey } from "@/lib/oracle-presign-contract";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const managerRoles = ["OWNER", "ADMIN"] as const;
const projectKindSchema = z.enum(faceboothProjectKinds);
const projectIdSchema = z.string().trim().min(1).max(128);

const createProjectInputSchema = z
  .object({
    name: faceboothProjectNameSchema,
    kind: projectKindSchema,
    document: z.unknown(),
  })
  .strict();

const saveProjectInputSchema = z
  .object({
    expectedEditVersion: z.number().int().min(1),
    name: faceboothProjectNameSchema,
    document: z.unknown(),
    previewObjectKey: z.string().trim().min(1).max(512).nullable().optional(),
  })
  .strict();

const renameProjectInputSchema = z
  .object({
    expectedEditVersion: z.number().int().min(1),
    name: faceboothProjectNameSchema,
  })
  .strict();

const publishSnapshotInputSchema = z
  .object({
    sceneProjectId: projectIdSchema,
    merchProjectIds: z
      .array(projectIdSchema)
      .max(6)
      .refine(
        (projectIds) => new Set(projectIds).size === projectIds.length,
        "Published merch projects must be unique.",
      ),
    previewObjectKey: z.string().trim().min(1).max(512).nullable(),
  })
  .strict();

const projectSelect = {
  id: true,
  boothId: true,
  kind: true,
  schemaVersion: true,
  editVersion: true,
  name: true,
  document: true,
  previewObjectKey: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FaceboothProjectSelect;

type ProjectRecord = Prisma.FaceboothProjectGetPayload<{
  select: typeof projectSelect;
}>;

function validationIssues(error: z.ZodError) {
  return error.issues.map((issue) => issue.message);
}

function toProjectDto(
  project: Omit<ProjectRecord, "document" | "kind"> & {
    document: FaceboothProjectDocument;
    kind: FaceboothProjectKind;
  },
) {
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

async function hasManagerMembership(
  transaction: TransactionClient,
  input: { boothId: string; actorUserId: string },
) {
  return transaction.boothMembership.findFirst({
    where: {
      boothId: input.boothId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: [...managerRoles] },
    },
    select: { id: true },
  });
}

function hasValidAssetKeys(
  boothId: string,
  document: FaceboothProjectDocument,
) {
  return [...collectFaceboothArtworkObjectKeys(document)].every((objectKey) =>
    isBoothFaceboothObjectKey(boothId, "artwork", objectKey),
  );
}

async function hasValidSceneReferences(
  transaction: TransactionClient,
  boothId: string,
  document: FaceboothProjectDocument,
) {
  if (document.kind !== "SCENE" || !document.merchSnapshots.length) {
    return true;
  }

  const sourceIds = [
    ...new Set(
      document.merchSnapshots.map((snapshot) => snapshot.sourceProjectId),
    ),
  ];
  const projects = await transaction.faceboothProject.findMany({
    where: {
      boothId,
      id: { in: sourceIds },
      kind: "MERCH",
    },
    select: { id: true, editVersion: true },
  });
  const editVersionById = new Map(
    projects.map((project) => [project.id, project.editVersion]),
  );
  return document.merchSnapshots.every((snapshot) => {
    const currentVersion = editVersionById.get(snapshot.sourceProjectId);
    return (
      currentVersion !== undefined &&
      snapshot.sourceEditVersion <= currentVersion
    );
  });
}

function parseStoredProject(project: ProjectRecord) {
  const document = parseFaceboothProjectDocument(
    project.kind,
    project.document,
  );
  if (!document || project.schemaVersion !== FACEBOOTH_DOCUMENT_VERSION) {
    return null;
  }
  return toProjectDto({ ...project, document });
}

export async function createFaceboothProject(input: {
  boothId: string;
  actorUserId: string;
  project: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }

    const parsedInput = createProjectInputSchema.safeParse(input.project);
    if (!parsedInput.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedInput.error),
      } as const;
    }
    const document = parseFaceboothProjectDocument(
      parsedInput.data.kind,
      parsedInput.data.document,
    );
    if (!document) {
      return {
        kind: "invalid",
        issues: ["Use a valid version-1 document matching the project kind."],
      } as const;
    }
    if (!hasValidAssetKeys(input.boothId, document)) {
      return { kind: "invalid-assets" } as const;
    }
    if (
      !(await hasValidSceneReferences(transaction, input.boothId, document))
    ) {
      return { kind: "invalid-references" } as const;
    }

    const project = await transaction.faceboothProject.create({
      data: {
        boothId: input.boothId,
        kind: parsedInput.data.kind,
        schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
        editVersion: 1,
        name: parsedInput.data.name,
        document: document as Prisma.InputJsonValue,
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      select: projectSelect,
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_created",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: { kind: project.kind, editVersion: project.editVersion },
      },
    });

    return { kind: "created", project: parseStoredProject(project)! } as const;
  });
}

export async function importFaceboothProject(input: {
  boothId: string;
  actorUserId: string;
  project: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedInput = createProjectInputSchema.safeParse(input.project);
    if (!parsedInput.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedInput.error),
      } as const;
    }
    const parsedDocument = parseFaceboothProjectDocument(
      parsedInput.data.kind,
      parsedInput.data.document,
    );
    if (!parsedDocument) return { kind: "invalid-document" } as const;
    if (!hasValidAssetKeys(input.boothId, parsedDocument)) {
      return { kind: "invalid-assets" } as const;
    }

    let document: FaceboothProjectDocument = parsedDocument;
    const importedMerchIds: string[] = [];
    if (document.kind === "SCENE") {
      const sourceIdByRevision = new Map<string, string>();
      for (const snapshot of document.merchSnapshots) {
        const sourceRevision = `${snapshot.sourceProjectId}:${snapshot.sourceEditVersion}`;
        if (sourceIdByRevision.has(sourceRevision)) continue;
        const importedMerch = await transaction.faceboothProject.create({
          data: {
            boothId: input.boothId,
            kind: "MERCH",
            schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
            editVersion: 1,
            name: snapshot.name,
            document: snapshot.document as Prisma.InputJsonValue,
            createdById: input.actorUserId,
            updatedById: input.actorUserId,
          },
          select: { id: true },
        });
        sourceIdByRevision.set(sourceRevision, importedMerch.id);
        importedMerchIds.push(importedMerch.id);
      }
      document = faceboothSceneDocumentSchema.parse({
        ...document,
        merchSnapshots: document.merchSnapshots.map((snapshot) => ({
          ...snapshot,
          sourceProjectId: sourceIdByRevision.get(
            `${snapshot.sourceProjectId}:${snapshot.sourceEditVersion}`,
          ),
          sourceEditVersion: 1,
        })),
      });
    }

    const project = await transaction.faceboothProject.create({
      data: {
        boothId: input.boothId,
        kind: parsedInput.data.kind,
        schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
        editVersion: 1,
        name: parsedInput.data.name,
        document: document as Prisma.InputJsonValue,
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      select: projectSelect,
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_imported",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: { kind: project.kind, importedMerchIds },
      },
    });
    return { kind: "imported", project: parseStoredProject(project)! } as const;
  });
}

export async function readFaceboothProjectForManager(input: {
  boothId: string;
  projectId: string;
  actorUserId: string;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const project = await transaction.faceboothProject.findFirst({
      where: { id: input.projectId, boothId: input.boothId },
      select: projectSelect,
    });
    if (!project) return { kind: "missing" } as const;
    const parsed = parseStoredProject(project);
    return parsed
      ? ({ kind: "found", project: parsed } as const)
      : ({ kind: "invalid-document" } as const);
  });
}

export async function listFaceboothProjectsForManager(input: {
  boothId: string;
  actorUserId: string;
  kind?: FaceboothProjectKind;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedKind = input.kind
      ? projectKindSchema.safeParse(input.kind)
      : null;
    if (parsedKind && !parsedKind.success) {
      return { kind: "invalid" } as const;
    }
    const projects = await transaction.faceboothProject.findMany({
      where: {
        boothId: input.boothId,
        ...(parsedKind?.success ? { kind: parsedKind.data } : {}),
      },
      select: {
        id: true,
        kind: true,
        schemaVersion: true,
        editVersion: true,
        name: true,
        previewObjectKey: true,
        createdById: true,
        updatedById: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    });
    return {
      kind: "found",
      projects: projects.map((project) => ({
        ...project,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    } as const;
  });
}

export async function saveFaceboothProject(input: {
  boothId: string;
  projectId: string;
  actorUserId: string;
  project: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedInput = saveProjectInputSchema.safeParse(input.project);
    if (!parsedInput.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedInput.error),
      } as const;
    }

    const existing = await transaction.faceboothProject.findFirst({
      where: { id: input.projectId, boothId: input.boothId },
      select: {
        kind: true,
        editVersion: true,
        previewObjectKey: true,
      },
    });
    if (!existing) return { kind: "missing" } as const;
    if (existing.editVersion !== parsedInput.data.expectedEditVersion) {
      return {
        kind: "conflict",
        expectedEditVersion: parsedInput.data.expectedEditVersion,
        currentEditVersion: existing.editVersion,
      } as const;
    }

    const document = parseFaceboothProjectDocument(
      existing.kind,
      parsedInput.data.document,
    );
    if (!document) {
      return {
        kind: "invalid",
        issues: ["Use a valid version-1 document matching the project kind."],
      } as const;
    }
    if (!hasValidAssetKeys(input.boothId, document)) {
      return { kind: "invalid-assets" } as const;
    }
    if (
      !(await hasValidSceneReferences(transaction, input.boothId, document))
    ) {
      return { kind: "invalid-references" } as const;
    }
    const previewObjectKey =
      parsedInput.data.previewObjectKey === undefined
        ? existing.previewObjectKey
        : parsedInput.data.previewObjectKey;
    if (
      previewObjectKey &&
      !isBoothFaceboothObjectKey(input.boothId, "preview", previewObjectKey)
    ) {
      return { kind: "invalid-assets" } as const;
    }

    const updated = await transaction.faceboothProject.updateMany({
      where: {
        id: input.projectId,
        boothId: input.boothId,
        editVersion: parsedInput.data.expectedEditVersion,
      },
      data: {
        name: parsedInput.data.name,
        document: document as Prisma.InputJsonValue,
        previewObjectKey,
        editVersion: { increment: 1 },
        updatedById: input.actorUserId,
      },
    });
    if (!updated.count) {
      const current = await transaction.faceboothProject.findFirst({
        where: { id: input.projectId, boothId: input.boothId },
        select: { editVersion: true },
      });
      return current
        ? ({
            kind: "conflict",
            expectedEditVersion: parsedInput.data.expectedEditVersion,
            currentEditVersion: current.editVersion,
          } as const)
        : ({ kind: "missing" } as const);
    }

    const project = await transaction.faceboothProject.findFirstOrThrow({
      where: { id: input.projectId, boothId: input.boothId },
      select: projectSelect,
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_saved",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: {
          previousEditVersion: parsedInput.data.expectedEditVersion,
          editVersion: project.editVersion,
        },
      },
    });
    return { kind: "saved", project: parseStoredProject(project)! } as const;
  });
}

export async function renameFaceboothProject(input: {
  boothId: string;
  projectId: string;
  actorUserId: string;
  rename: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedInput = renameProjectInputSchema.safeParse(input.rename);
    if (!parsedInput.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedInput.error),
      } as const;
    }
    const updated = await transaction.faceboothProject.updateMany({
      where: {
        id: input.projectId,
        boothId: input.boothId,
        editVersion: parsedInput.data.expectedEditVersion,
      },
      data: {
        name: parsedInput.data.name,
        editVersion: { increment: 1 },
        updatedById: input.actorUserId,
      },
    });
    if (!updated.count) {
      const current = await transaction.faceboothProject.findFirst({
        where: { id: input.projectId, boothId: input.boothId },
        select: { editVersion: true },
      });
      return current
        ? ({
            kind: "conflict",
            expectedEditVersion: parsedInput.data.expectedEditVersion,
            currentEditVersion: current.editVersion,
          } as const)
        : ({ kind: "missing" } as const);
    }
    const project = await transaction.faceboothProject.findFirstOrThrow({
      where: { id: input.projectId, boothId: input.boothId },
      select: projectSelect,
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_renamed",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: { editVersion: project.editVersion },
      },
    });
    return { kind: "renamed", project: parseStoredProject(project)! } as const;
  });
}

export async function duplicateFaceboothProject(input: {
  boothId: string;
  projectId: string;
  actorUserId: string;
  name: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedName = faceboothProjectNameSchema.safeParse(input.name);
    if (!parsedName.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedName.error),
      } as const;
    }
    const source = await transaction.faceboothProject.findFirst({
      where: { id: input.projectId, boothId: input.boothId },
      select: projectSelect,
    });
    if (!source) return { kind: "missing" } as const;
    const document = parseFaceboothProjectDocument(
      source.kind,
      source.document,
    );
    if (!document) return { kind: "invalid-document" } as const;
    if (!hasValidAssetKeys(input.boothId, document)) {
      return { kind: "invalid-assets" } as const;
    }
    if (
      !(await hasValidSceneReferences(transaction, input.boothId, document))
    ) {
      return { kind: "invalid-references" } as const;
    }
    const project = await transaction.faceboothProject.create({
      data: {
        boothId: input.boothId,
        kind: source.kind,
        schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
        editVersion: 1,
        name: parsedName.data,
        document: document as Prisma.InputJsonValue,
        previewObjectKey: source.previewObjectKey,
        createdById: input.actorUserId,
        updatedById: input.actorUserId,
      },
      select: projectSelect,
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_duplicated",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: { sourceProjectId: source.id, kind: source.kind },
      },
    });
    return {
      kind: "duplicated",
      project: parseStoredProject(project)!,
    } as const;
  });
}

export async function deleteFaceboothProject(input: {
  boothId: string;
  projectId: string;
  actorUserId: string;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const project = await transaction.faceboothProject.findFirst({
      where: { id: input.projectId, boothId: input.boothId },
      select: { id: true, kind: true, name: true, previewObjectKey: true },
    });
    if (!project) return { kind: "missing" } as const;

    if (project.kind === "MERCH") {
      const sceneRecords = await transaction.faceboothProject.findMany({
        where: { boothId: input.boothId, kind: "SCENE" },
        select: { id: true, document: true },
      });
      const referencingSceneIds = sceneRecords.flatMap((scene) => {
        const document = parseFaceboothProjectDocument("SCENE", scene.document);
        return document?.merchSnapshots.some(
          ({ sourceProjectId }) => sourceProjectId === project.id,
        )
          ? [scene.id]
          : [];
      });
      if (referencingSceneIds.length) {
        return {
          kind: "in-use",
          referencingSceneIds,
        } as const;
      }
    }

    await transaction.faceboothProject.delete({ where: { id: project.id } });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.project_deleted",
        entityType: "FaceboothProject",
        entityId: project.id,
        metadata: {
          kind: project.kind,
          name: project.name,
          hadPreview: Boolean(project.previewObjectKey),
        },
      },
    });
    return { kind: "deleted", projectId: project.id } as const;
  });
}

export async function publishFaceboothSnapshot(input: {
  boothId: string;
  actorUserId: string;
  publication: unknown;
}) {
  return db.$transaction(async (transaction) => {
    if (!(await hasManagerMembership(transaction, input))) {
      return { kind: "forbidden" } as const;
    }
    const parsedInput = publishSnapshotInputSchema.safeParse(input.publication);
    if (!parsedInput.success) {
      return {
        kind: "invalid",
        issues: validationIssues(parsedInput.error),
      } as const;
    }
    if (
      parsedInput.data.previewObjectKey &&
      !isBoothFaceboothObjectKey(
        input.boothId,
        "preview",
        parsedInput.data.previewObjectKey,
      )
    ) {
      return { kind: "invalid-assets" } as const;
    }

    const requestedIds = [
      parsedInput.data.sceneProjectId,
      ...parsedInput.data.merchProjectIds,
    ];
    const projects = await transaction.faceboothProject.findMany({
      where: { boothId: input.boothId, id: { in: requestedIds } },
      select: projectSelect,
    });
    if (projects.length !== requestedIds.length) {
      return { kind: "invalid-references" } as const;
    }
    const sceneRecord = projects.find(
      (project) => project.id === parsedInput.data.sceneProjectId,
    );
    if (!sceneRecord || sceneRecord.kind !== "SCENE") {
      return { kind: "invalid-references" } as const;
    }
    const sceneDocument = parseFaceboothProjectDocument(
      "SCENE",
      sceneRecord.document,
    );
    if (!sceneDocument || !hasValidAssetKeys(input.boothId, sceneDocument)) {
      return { kind: "invalid-document" } as const;
    }

    const merchRecords = parsedInput.data.merchProjectIds.map((projectId) =>
      projects.find((project) => project.id === projectId),
    );
    if (merchRecords.some((project) => !project || project.kind !== "MERCH")) {
      return { kind: "invalid-references" } as const;
    }
    const merch = merchRecords.flatMap((project) => {
      if (!project || project.kind !== "MERCH") return [];
      const document = parseFaceboothProjectDocument("MERCH", project.document);
      return document && hasValidAssetKeys(input.boothId, document)
        ? [
            {
              projectId: project.id,
              editVersion: project.editVersion,
              name: project.name,
              document,
            },
          ]
        : [];
    });
    if (merch.length !== merchRecords.length) {
      return { kind: "invalid-document" } as const;
    }

    const publishedAt = new Date();
    const candidate: FaceboothPublicationDocument = {
      version: FACEBOOTH_DOCUMENT_VERSION,
      publishedAt: publishedAt.toISOString(),
      scene: {
        projectId: sceneRecord.id,
        editVersion: sceneRecord.editVersion,
        name: sceneRecord.name,
        document: sceneDocument as FaceboothSceneDocument,
      },
      merch,
      previewObjectKey: parsedInput.data.previewObjectKey,
    };
    const document = faceboothPublicationDocumentSchema.safeParse(candidate);
    if (
      !document.success ||
      faceboothDocumentByteLength(candidate) > FACEBOOTH_DOCUMENT_MAX_BYTES
    ) {
      return { kind: "invalid-document" } as const;
    }

    const publication = await transaction.faceboothPublication.upsert({
      where: { boothId: input.boothId },
      create: {
        boothId: input.boothId,
        schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
        revision: 1,
        document: document.data as Prisma.InputJsonValue,
        previewObjectKey: document.data.previewObjectKey,
        publishedById: input.actorUserId,
        publishedAt,
      },
      update: {
        schemaVersion: FACEBOOTH_DOCUMENT_VERSION,
        revision: { increment: 1 },
        document: document.data as Prisma.InputJsonValue,
        previewObjectKey: document.data.previewObjectKey,
        publishedById: input.actorUserId,
        publishedAt,
      },
      select: {
        id: true,
        revision: true,
        publishedAt: true,
        publishedById: true,
      },
    });
    await transaction.auditLog.create({
      data: {
        boothId: input.boothId,
        actorUserId: input.actorUserId,
        action: "facebooth.publication_published",
        entityType: "FaceboothPublication",
        entityId: publication.id,
        metadata: {
          revision: publication.revision,
          sceneProjectId: sceneRecord.id,
          merchProjectIds: parsedInput.data.merchProjectIds,
        },
      },
    });

    return {
      kind: "published",
      publication: {
        ...publication,
        document: document.data,
        publishedAt: publication.publishedAt.toISOString(),
      },
    } as const;
  });
}
