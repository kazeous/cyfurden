import "server-only";

import { db } from "@/lib/db";
import {
  OracleFaceboothAssetVerificationError,
  verifyBoothFaceboothUpload,
} from "@/lib/oracle-presign";
import {
  type FaceboothUploadPurpose,
  isBoothFaceboothObjectKey,
} from "@/lib/oracle-presign-contract";

export async function verifyFaceboothUploadForManager(input: {
  boothId: string;
  actorUserId: string;
  objectKey: string;
  purpose: FaceboothUploadPurpose;
}) {
  const membership = await db.boothMembership.findFirst({
    where: {
      boothId: input.boothId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { id: true },
  });
  if (!membership) return { kind: "forbidden" } as const;
  if (
    !isBoothFaceboothObjectKey(input.boothId, input.purpose, input.objectKey)
  ) {
    return { kind: "invalid-asset" } as const;
  }

  try {
    await verifyBoothFaceboothUpload(input);
    return { kind: "verified", objectKey: input.objectKey } as const;
  } catch (error) {
    if (error instanceof OracleFaceboothAssetVerificationError) {
      return { kind: "invalid-upload", message: error.message } as const;
    }
    throw error;
  }
}
