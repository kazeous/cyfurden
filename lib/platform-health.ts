import "server-only";

import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import type { PlatformAccessResult } from "@/lib/platform-access";
import {
  collectPlatformCurrentHealth,
  createPlatformCurrentHealthReader,
  type PlatformHealthProbe,
} from "@/lib/platform-health-contract";
import {
  createOracleClient,
  getOracleUploadConfig,
} from "@/lib/oracle-uploads";

function assertPlatformHealthAccess(
  access: PlatformAccessResult,
): asserts access is Extract<PlatformAccessResult, { allowed: true }> {
  if (!access.allowed || access.permission !== "platform.read") {
    throw new Error("Platform health access denied.");
  }
}

function defaultDatabaseProbe(): PlatformHealthProbe {
  return async () => {
    await db.$queryRaw`SELECT 1`;
  };
}

function defaultOracleProbe(): PlatformHealthProbe | undefined {
  let config: ReturnType<typeof getOracleUploadConfig>;
  try {
    config = getOracleUploadConfig();
  } catch {
    return undefined;
  }
  return async (signal) => {
    const client = createOracleClient(config);
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
        abortSignal: signal,
      });
    } finally {
      client.destroy();
    }
  };
}

const readCachedPlatformCurrentHealth = createPlatformCurrentHealthReader(() =>
  collectPlatformCurrentHealth({
    probes: {
      database: defaultDatabaseProbe(),
      oracle: defaultOracleProbe(),
    },
    releaseId: process.env.CYFURDEN_RELEASE_ID,
  }),
);

export async function readPlatformCurrentHealth(access: PlatformAccessResult) {
  assertPlatformHealthAccess(access);
  return readCachedPlatformCurrentHealth();
}
