import "server-only";

import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  createOracleClient,
  getOracleUploadConfig,
} from "@/lib/oracle-uploads";
import {
  STORAGE_RECONCILIATION_PAGE_SIZE,
  type StorageProviderObject,
  type StorageProviderPage,
} from "@/lib/storage-reconciliation";

export async function loadOracleStoragePage(input: {
  boothId: string;
  cursor: string | null;
}): Promise<StorageProviderPage> {
  const config = getOracleUploadConfig();
  const client = createOracleClient(config);
  const prefix = `booths/${input.boothId}/`;
  const listed = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      ContinuationToken: input.cursor ?? undefined,
      MaxKeys: STORAGE_RECONCILIATION_PAGE_SIZE,
      Prefix: prefix,
    }),
  );
  const candidates = (listed.Contents ?? []).flatMap((entry) => {
    const objectKey = entry.Key;
    return objectKey?.startsWith(prefix) && objectKey.length <= 1_024
      ? [objectKey]
      : [];
  });
  const objects: StorageProviderObject[] = [];
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const batch = candidates.slice(offset, offset + 10);
    const headed = await Promise.all(
      batch.map(async (objectKey) => {
        const head = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }),
        );
        return {
          byteLength: BigInt(Math.max(1, head.ContentLength ?? 1)),
          objectKey,
          verifiedMime:
            head.ContentType?.trim().slice(0, 120) ||
            "application/octet-stream",
        };
      }),
    );
    objects.push(...headed);
  }
  return {
    nextCursor: listed.IsTruncated
      ? (listed.NextContinuationToken ?? null)
      : null,
    objects,
  };
}
