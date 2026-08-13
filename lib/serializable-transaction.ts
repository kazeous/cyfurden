import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type TransactionClient = Prisma.TransactionClient;

function isSerializationConflict(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2034") return true;
  if (!("cause" in error) || typeof error.cause !== "object" || !error.cause) {
    return false;
  }
  const cause = error.cause as {
    kind?: unknown;
    originalCode?: unknown;
  };
  return (
    cause.originalCode === "40001" || cause.kind === "TransactionWriteConflict"
  );
}

export async function runSerializableTransaction<T>(
  operation: (transaction: TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (attempt < 2 && isSerializationConflict(error)) continue;
      throw error;
    }
  }

  throw new Error("Serializable transaction exhausted its retries.");
}
