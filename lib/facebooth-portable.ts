import {
  collectFaceboothArtworkObjectKeys,
  faceboothExportPackageSchema,
  FACEBOOTH_ASSET_MAX_BYTES,
  FACEBOOTH_DOCUMENT_VERSION,
  FACEBOOTH_EXPORT_MAX_TOTAL_BYTES,
  type FaceboothExportPackage,
  type FaceboothProjectDocument,
  type FaceboothProjectKind,
} from "@/lib/facebooth-documents";
import { validateProductImageBytes } from "@/lib/payment-qr";

const MAX_PORTABLE_JSON_BYTES =
  Math.ceil((FACEBOOTH_EXPORT_MAX_TOTAL_BYTES * 4) / 3) + 2 * 1024 * 1024;

export class FaceboothPortableError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID"
      | "UNSUPPORTED_VERSION"
      | "ASSET_MISMATCH"
      | "TOO_LARGE",
  ) {
    super(message);
    this.name = "FaceboothPortableError";
  }
}

type ArtworkContentType = "image/jpeg" | "image/png" | "image/webp";

function artworkContentTypes(document: FaceboothProjectDocument) {
  const result = new Map<string, ArtworkContentType>();
  const collect = (artwork: {
    objectKey: string | null;
    contentType: ArtworkContentType | null;
  }) => {
    if (artwork.objectKey && artwork.contentType) {
      result.set(artwork.objectKey, artwork.contentType);
    }
  };
  if (document.kind === "MERCH") collect(document.artwork);
  else {
    document.merchSnapshots.forEach((snapshot) =>
      collect(snapshot.document.artwork),
    );
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createFaceboothExportPackage(input: {
  name: string;
  kind: FaceboothProjectKind;
  document: FaceboothProjectDocument;
  assetUrls: Record<string, string>;
  fetchAsset?: typeof fetch;
  exportedAt?: string;
}) {
  const fetchAsset = input.fetchAsset ?? fetch;
  const contentTypes = artworkContentTypes(input.document);
  const keys = [...collectFaceboothArtworkObjectKeys(input.document)].sort();
  const assets: FaceboothExportPackage["assets"] = [];
  let totalBytes = 0;
  for (const sourceObjectKey of keys) {
    const assetUrl = input.assetUrls[sourceObjectKey];
    const expectedContentType = contentTypes.get(sourceObjectKey);
    if (!assetUrl || !expectedContentType) {
      throw new FaceboothPortableError(
        "A referenced artwork asset is unavailable.",
        "ASSET_MISMATCH",
      );
    }
    const response = await fetchAsset(assetUrl, { credentials: "omit" });
    if (!response.ok) {
      throw new FaceboothPortableError(
        "A referenced artwork asset could not be downloaded.",
        "ASSET_MISMATCH",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.byteLength > FACEBOOTH_ASSET_MAX_BYTES) {
      throw new FaceboothPortableError(
        "A referenced artwork asset has an invalid size.",
        "TOO_LARGE",
      );
    }
    const inspected = validateProductImageBytes(bytes);
    if (inspected.contentType !== expectedContentType) {
      throw new FaceboothPortableError(
        "Artwork bytes do not match the stored content type.",
        "ASSET_MISMATCH",
      );
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > FACEBOOTH_EXPORT_MAX_TOTAL_BYTES) {
      throw new FaceboothPortableError(
        "The portable project exceeds the total artwork limit.",
        "TOO_LARGE",
      );
    }
    assets.push({
      sourceObjectKey,
      contentType: expectedContentType,
      byteLength: bytes.byteLength,
      sha256: await sha256(bytes),
      dataBase64: bytesToBase64(bytes),
    });
  }
  return faceboothExportPackageSchema.parse({
    format: "CYFURDEN_FACEBOOTH_PROJECT",
    version: FACEBOOTH_DOCUMENT_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    project: {
      name: input.name,
      kind: input.kind,
      document: input.document,
    },
    assets,
  });
}

export async function parseFaceboothExportFile(file: File) {
  if (!file.size || file.size > MAX_PORTABLE_JSON_BYTES) {
    throw new FaceboothPortableError(
      "The portable project file is too large.",
      "TOO_LARGE",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new FaceboothPortableError(
      "The portable project is not valid JSON.",
      "INVALID",
    );
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    value.format === "CYFURDEN_FACEBOOTH_PROJECT" &&
    "version" in value &&
    value.version !== FACEBOOTH_DOCUMENT_VERSION
  ) {
    throw new FaceboothPortableError(
      "This Facebooth project version is not supported.",
      "UNSUPPORTED_VERSION",
    );
  }
  const parsed = faceboothExportPackageSchema.safeParse(value);
  if (!parsed.success) {
    throw new FaceboothPortableError(
      "The portable project failed strict validation.",
      "INVALID",
    );
  }
  const decodedAssets = new Map<string, Uint8Array>();
  for (const asset of parsed.data.assets) {
    const bytes = base64ToBytes(asset.dataBase64);
    const inspected = validateProductImageBytes(bytes);
    if (
      bytes.byteLength !== asset.byteLength ||
      inspected.contentType !== asset.contentType ||
      (await sha256(bytes)) !== asset.sha256
    ) {
      throw new FaceboothPortableError(
        "Portable artwork bytes failed integrity validation.",
        "ASSET_MISMATCH",
      );
    }
    decodedAssets.set(asset.sourceObjectKey, bytes);
  }
  return { package: parsed.data, decodedAssets };
}

export function replaceFaceboothArtworkObjectKeys(
  document: FaceboothProjectDocument,
  objectKeys: ReadonlyMap<string, string>,
) {
  const replaceArtwork = <T extends { objectKey: string | null }>(
    artwork: T,
  ) => {
    if (!artwork.objectKey) return artwork;
    const objectKey = objectKeys.get(artwork.objectKey);
    if (!objectKey) {
      throw new FaceboothPortableError(
        "An imported artwork mapping is missing.",
        "ASSET_MISMATCH",
      );
    }
    return { ...artwork, objectKey };
  };
  if (document.kind === "MERCH") {
    return {
      ...document,
      artwork: replaceArtwork(document.artwork),
    } satisfies FaceboothProjectDocument;
  }
  return {
    ...document,
    merchSnapshots: document.merchSnapshots.map((snapshot) => ({
      ...snapshot,
      document: {
        ...snapshot.document,
        artwork: replaceArtwork(snapshot.document.artwork),
      },
    })),
  } satisfies FaceboothProjectDocument;
}

export function downloadFaceboothFile(
  contents: BlobPart,
  fileName: string,
  contentType: string,
) {
  const url = URL.createObjectURL(new Blob([contents], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
}

export function faceboothFileStem(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "facebooth-project"
  );
}
