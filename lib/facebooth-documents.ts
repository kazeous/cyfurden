import { z } from "zod";

export const FACEBOOTH_DOCUMENT_VERSION = 1 as const;
export const FACEBOOTH_DOCUMENT_MAX_BYTES = 512 * 1024;
export const FACEBOOTH_EXPORT_MAX_ASSETS = 100;
export const FACEBOOTH_EXPORT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const FACEBOOTH_ASSET_MAX_BYTES = 20 * 1024 * 1024;
export const FACEBOOTH_MAX_CONTOUR_POINTS = 256;
export const FACEBOOTH_MAX_MERCH_SNAPSHOTS = 100;
export const FACEBOOTH_MAX_SCENE_INSTANCES = 500;

export const faceboothProjectKinds = ["MERCH", "SCENE"] as const;
export type FaceboothProjectKind = (typeof faceboothProjectKinds)[number];

export const faceboothProjectNameSchema = z.string().trim().min(1).max(120);

const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const objectKeySchema = z.string().trim().min(1).max(512);
const faceboothArtworkObjectKeySchema = objectKeySchema.regex(
  /^booths\/[a-zA-Z0-9_-]+\/facebooth\/artwork-[a-f0-9-]+\.(?:jpg|png|webp)$/i,
);
const faceboothPreviewObjectKeySchema = objectKeySchema.regex(
  /^booths\/[a-zA-Z0-9_-]+\/facebooth\/preview-[a-f0-9-]+\.(?:jpg|png|webp)$/i,
);
const positiveDimensionMmSchema = z.number().int().min(1).max(10_000);
const standeeDimensionMmSchema = z.number().int().min(20).max(2_000);
const positionMmSchema = z.number().int().min(-20_000).max(20_000);
const rotationMilliDegreesSchema = z.number().int().min(-360_000).max(360_000);
const extensionByContentType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const normalizedPointSchema = z
  .object({
    xMillionths: z.number().int().min(0).max(1_000_000),
    yMillionths: z.number().int().min(0).max(1_000_000),
  })
  .strict();

export const faceboothTransformSchema = z
  .object({
    positionMm: z
      .object({
        x: positionMmSchema,
        y: positionMmSchema,
        z: positionMmSchema,
      })
      .strict(),
    rotationMilliDegrees: z
      .object({
        x: rotationMilliDegreesSchema,
        y: rotationMilliDegreesSchema,
        z: rotationMilliDegreesSchema,
      })
      .strict(),
  })
  .strict();

const artworkSchema = z
  .object({
    objectKey: faceboothArtworkObjectKeySchema.nullable(),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).nullable(),
    pixelWidth: z.number().int().min(1).max(16_384).nullable(),
    pixelHeight: z.number().int().min(1).max(16_384).nullable(),
    contourPoints: z
      .array(normalizedPointSchema)
      .min(3)
      .max(FACEBOOTH_MAX_CONTOUR_POINTS)
      .nullable(),
    opaqueFallback: z.boolean(),
  })
  .strict()
  .superRefine((artwork, context) => {
    const assetFields = [
      artwork.objectKey,
      artwork.contentType,
      artwork.pixelWidth,
      artwork.pixelHeight,
    ];
    const populated = assetFields.filter((value) => value !== null).length;
    if (populated !== 0 && populated !== assetFields.length) {
      context.addIssue({
        code: "custom",
        message: "Artwork metadata must be complete when an object key exists.",
      });
    }
    if (!artwork.objectKey && artwork.contourPoints) {
      context.addIssue({
        code: "custom",
        path: ["contourPoints"],
        message: "Contour points require uploaded artwork.",
      });
    }
    if (
      artwork.objectKey &&
      artwork.contentType &&
      !artwork.objectKey
        .toLowerCase()
        .endsWith(`.${extensionByContentType[artwork.contentType]}`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "Artwork content type must match its object key.",
      });
    }
  });

export const acrylicStandeeDocumentSchema = z
  .object({
    version: z.literal(FACEBOOTH_DOCUMENT_VERSION),
    kind: z.literal("MERCH"),
    merchType: z.literal("ACRYLIC_STANDEE"),
    artwork: artworkSchema,
    sizeMm: z
      .object({
        width: standeeDimensionMmSchema,
        height: standeeDimensionMmSchema,
        thickness: z.union([z.literal(2), z.literal(3), z.literal(5)]),
      })
      .strict(),
    print: z
      .object({
        sides: z.enum(["FRONT", "TWO_SIDED"]),
        borderMm: z.number().int().min(0).max(100),
      })
      .strict(),
    material: z
      .object({
        finish: z.enum(["CLEAR", "FROSTED", "TINTED", "IRIDESCENT"]),
        tintHex: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .nullable(),
      })
      .strict()
      .superRefine((material, context) => {
        if (material.finish === "TINTED" && !material.tintHex) {
          context.addIssue({
            code: "custom",
            path: ["tintHex"],
            message: "Tinted acrylic requires a tint color.",
          });
        }
      }),
    base: z
      .object({
        enabled: z.boolean(),
        widthMm: standeeDimensionMmSchema,
        depthMm: z.number().int().min(10).max(1_000),
        thicknessMm: z.number().int().min(2).max(100),
      })
      .strict(),
  })
  .strict();

const sceneTableSchema = z
  .object({
    sizeMm: z
      .object({
        width: z.number().int().min(100).max(5_000),
        depth: z.number().int().min(100).max(5_000),
        height: z.number().int().min(100).max(2_000),
      })
      .strict(),
    topThicknessMm: z.number().int().min(5).max(200),
    edge: z.enum(["SQUARE", "ROUNDED", "BEVELLED"]),
    legStyle: z.enum(["FOUR_LEG", "TRESTLE", "PEDESTAL"]),
    finish: z.enum(["WOOD_LIGHT", "WOOD_DARK", "WHITE", "BLACK"]),
    transform: faceboothTransformSchema,
  })
  .strict();

const backdropPanelSchema = z
  .object({
    id: entityIdSchema,
    sizeMm: z
      .object({
        width: positiveDimensionMmSchema,
        height: positiveDimensionMmSchema,
        thickness: z.number().int().min(1).max(200),
      })
      .strict(),
    finish: z.enum(["WHITE", "BLACK", "WOOD_LIGHT", "WOOD_DARK"]),
    transform: faceboothTransformSchema,
  })
  .strict();

const shelfSchema = z
  .object({
    id: entityIdSchema,
    kind: z.enum(["SHELF", "RISER"]),
    sizeMm: z
      .object({
        width: positiveDimensionMmSchema,
        depth: positiveDimensionMmSchema,
        height: positiveDimensionMmSchema,
      })
      .strict(),
    finish: z.enum(["CLEAR", "WHITE", "BLACK", "WOOD_LIGHT", "WOOD_DARK"]),
    transform: faceboothTransformSchema,
  })
  .strict();

const merchSnapshotSchema = z
  .object({
    id: entityIdSchema,
    sourceProjectId: entityIdSchema,
    sourceEditVersion: z.number().int().min(1),
    name: faceboothProjectNameSchema,
    document: acrylicStandeeDocumentSchema,
  })
  .strict();

const sceneInstanceSchema = z
  .object({
    id: entityIdSchema,
    merchSnapshotId: entityIdSchema,
    transform: faceboothTransformSchema,
  })
  .strict();

export const faceboothSceneDocumentSchema = z
  .object({
    version: z.literal(FACEBOOTH_DOCUMENT_VERSION),
    kind: z.literal("SCENE"),
    footprintMm: z
      .object({
        width: z.number().int().min(500).max(10_000),
        depth: z.number().int().min(500).max(10_000),
        height: z.number().int().min(500).max(5_000),
      })
      .strict(),
    table: sceneTableSchema,
    backdrops: z.array(backdropPanelSchema).max(32),
    shelves: z.array(shelfSchema).max(64),
    merchSnapshots: z
      .array(merchSnapshotSchema)
      .max(FACEBOOTH_MAX_MERCH_SNAPSHOTS),
    instances: z.array(sceneInstanceSchema).max(FACEBOOTH_MAX_SCENE_INSTANCES),
  })
  .strict()
  .superRefine((scene, context) => {
    for (const [path, ids] of [
      ["backdrops", scene.backdrops.map(({ id }) => id)],
      ["shelves", scene.shelves.map(({ id }) => id)],
      ["merchSnapshots", scene.merchSnapshots.map(({ id }) => id)],
      ["instances", scene.instances.map(({ id }) => id)],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: `${path} must use unique IDs.`,
        });
      }
    }

    const snapshotIds = new Set(
      scene.merchSnapshots.map((snapshot) => snapshot.id),
    );
    const sourceRevisions = scene.merchSnapshots.map(
      (snapshot) => `${snapshot.sourceProjectId}:${snapshot.sourceEditVersion}`,
    );
    if (new Set(sourceRevisions).size !== sourceRevisions.length) {
      context.addIssue({
        code: "custom",
        path: ["merchSnapshots"],
        message: "Each merch project revision must have one snapshot.",
      });
    }
    scene.instances.forEach((instance, index) => {
      if (!snapshotIds.has(instance.merchSnapshotId)) {
        context.addIssue({
          code: "custom",
          path: ["instances", index, "merchSnapshotId"],
          message: "Scene instances must reference an included merch snapshot.",
        });
      }
    });
  });

export const faceboothProjectDocumentSchema = z.discriminatedUnion("kind", [
  acrylicStandeeDocumentSchema,
  faceboothSceneDocumentSchema,
]);

export type AcrylicStandeeDocument = z.infer<
  typeof acrylicStandeeDocumentSchema
>;
export type FaceboothSceneDocument = z.infer<
  typeof faceboothSceneDocumentSchema
>;
export type FaceboothProjectDocument = z.infer<
  typeof faceboothProjectDocumentSchema
>;

const publicationSceneSchema = z
  .object({
    projectId: entityIdSchema,
    editVersion: z.number().int().min(1),
    name: faceboothProjectNameSchema,
    document: faceboothSceneDocumentSchema,
  })
  .strict();

const publicationMerchSchema = z
  .object({
    projectId: entityIdSchema,
    editVersion: z.number().int().min(1),
    name: faceboothProjectNameSchema,
    document: acrylicStandeeDocumentSchema,
  })
  .strict();

export const faceboothPublicationDocumentSchema = z
  .object({
    version: z.literal(FACEBOOTH_DOCUMENT_VERSION),
    publishedAt: z.iso.datetime(),
    scene: publicationSceneSchema,
    merch: z.array(publicationMerchSchema).max(6),
    previewObjectKey: faceboothPreviewObjectKeySchema.nullable(),
  })
  .strict()
  .superRefine((publication, context) => {
    const projectIds = publication.merch.map(({ projectId }) => projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: "custom",
        path: ["merch"],
        message: "Published merch projects must be unique.",
      });
    }
  });

export type FaceboothPublicationDocument = z.infer<
  typeof faceboothPublicationDocumentSchema
>;

const exportAssetSchema = z
  .object({
    sourceObjectKey: faceboothArtworkObjectKeySchema,
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteLength: z.number().int().positive().max(FACEBOOTH_ASSET_MAX_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    dataBase64: z
      .string()
      .min(1)
      .max(Math.ceil(FACEBOOTH_ASSET_MAX_BYTES / 3) * 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict()
  .superRefine((asset, context) => {
    if (
      !asset.sourceObjectKey
        .toLowerCase()
        .endsWith(`.${extensionByContentType[asset.contentType]}`)
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "Asset content type must match its source object key.",
      });
    }
    const padding = asset.dataBase64.endsWith("==")
      ? 2
      : asset.dataBase64.endsWith("=")
        ? 1
        : 0;
    const decodedLength = (asset.dataBase64.length * 3) / 4 - padding;
    if (decodedLength !== asset.byteLength) {
      context.addIssue({
        code: "custom",
        path: ["byteLength"],
        message: "Asset byte length must match its base64 payload.",
      });
    }
  });

export const faceboothExportPackageSchema = z
  .object({
    format: z.literal("CYFURDEN_FACEBOOTH_PROJECT"),
    version: z.literal(FACEBOOTH_DOCUMENT_VERSION),
    exportedAt: z.iso.datetime(),
    project: z
      .object({
        name: faceboothProjectNameSchema,
        kind: z.enum(faceboothProjectKinds),
        document: faceboothProjectDocumentSchema,
      })
      .strict(),
    assets: z.array(exportAssetSchema).max(FACEBOOTH_EXPORT_MAX_ASSETS),
  })
  .strict()
  .superRefine((projectPackage, context) => {
    if (projectPackage.project.kind !== projectPackage.project.document.kind) {
      context.addIssue({
        code: "custom",
        path: ["project", "kind"],
        message: "The package project kind must match its document.",
      });
    }

    const assetKeys = projectPackage.assets.map(
      ({ sourceObjectKey }) => sourceObjectKey,
    );
    if (new Set(assetKeys).size !== assetKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Exported assets must be deduplicated.",
      });
    }

    const referencedKeys = collectFaceboothArtworkObjectKeys(
      projectPackage.project.document,
    );
    if (
      referencedKeys.size !== assetKeys.length ||
      assetKeys.some((key) => !referencedKeys.has(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "Exported assets must exactly match referenced artwork.",
      });
    }

    const totalBytes = projectPackage.assets.reduce(
      (sum, asset) => sum + asset.byteLength,
      0,
    );
    if (totalBytes > FACEBOOTH_EXPORT_MAX_TOTAL_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["assets"],
        message: "The exported asset payload is too large.",
      });
    }
  });

export type FaceboothExportPackage = z.infer<
  typeof faceboothExportPackageSchema
>;

export function createDefaultAcrylicStandeeDocument(): AcrylicStandeeDocument {
  return {
    version: FACEBOOTH_DOCUMENT_VERSION,
    kind: "MERCH",
    merchType: "ACRYLIC_STANDEE",
    artwork: {
      objectKey: null,
      contentType: null,
      pixelWidth: null,
      pixelHeight: null,
      contourPoints: null,
      opaqueFallback: false,
    },
    sizeMm: { width: 100, height: 150, thickness: 3 },
    print: { sides: "FRONT", borderMm: 3 },
    material: { finish: "CLEAR", tintHex: null },
    base: { enabled: true, widthMm: 80, depthMm: 40, thicknessMm: 5 },
  };
}

export function createDefaultFaceboothSceneDocument(): FaceboothSceneDocument {
  return {
    version: FACEBOOTH_DOCUMENT_VERSION,
    kind: "SCENE",
    footprintMm: { width: 3_000, depth: 3_000, height: 2_500 },
    table: {
      sizeMm: { width: 1_800, depth: 750, height: 740 },
      topThicknessMm: 30,
      edge: "ROUNDED",
      legStyle: "FOUR_LEG",
      finish: "WOOD_LIGHT",
      transform: {
        positionMm: { x: 0, y: 0, z: 0 },
        rotationMilliDegrees: { x: 0, y: 0, z: 0 },
      },
    },
    backdrops: [],
    shelves: [],
    merchSnapshots: [],
    instances: [],
  };
}

export function collectFaceboothArtworkObjectKeys(
  document: FaceboothProjectDocument,
) {
  const keys = new Set<string>();
  if (document.kind === "MERCH") {
    if (document.artwork.objectKey) keys.add(document.artwork.objectKey);
    return keys;
  }

  for (const snapshot of document.merchSnapshots) {
    if (snapshot.document.artwork.objectKey) {
      keys.add(snapshot.document.artwork.objectKey);
    }
  }
  return keys;
}

export function collectFaceboothSourceProjectIds(
  document: FaceboothProjectDocument,
) {
  return document.kind === "SCENE"
    ? new Set(
        document.merchSnapshots.map((snapshot) => snapshot.sourceProjectId),
      )
    : new Set<string>();
}

export function faceboothDocumentByteLength(
  document: FaceboothProjectDocument | FaceboothPublicationDocument,
) {
  return new TextEncoder().encode(JSON.stringify(document)).byteLength;
}

export function parseFaceboothProjectDocument(
  kind: "MERCH",
  value: unknown,
): AcrylicStandeeDocument | null;
export function parseFaceboothProjectDocument(
  kind: "SCENE",
  value: unknown,
): FaceboothSceneDocument | null;
export function parseFaceboothProjectDocument(
  kind: FaceboothProjectKind,
  value: unknown,
): FaceboothProjectDocument | null;
export function parseFaceboothProjectDocument(
  kind: FaceboothProjectKind,
  value: unknown,
): FaceboothProjectDocument | null {
  const parsed = faceboothProjectDocumentSchema.safeParse(value);
  if (!parsed.success || parsed.data.kind !== kind) return null;
  if (faceboothDocumentByteLength(parsed.data) > FACEBOOTH_DOCUMENT_MAX_BYTES) {
    return null;
  }
  return parsed.data;
}
