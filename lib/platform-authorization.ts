import "server-only";

import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/authorization";
import {
  authorizePlatformSession,
  bootstrapInitialPlatformSuperAdmin,
  type PlatformAccessResult,
} from "@/lib/platform-access";
import type { PlatformPermission } from "@/lib/platform-policy";

export async function getPlatformAccess(
  permission: PlatformPermission,
): Promise<PlatformAccessResult> {
  const session = await getCurrentSession();
  if (!session) return { allowed: false, reason: "UNAUTHENTICATED" };

  await bootstrapInitialPlatformSuperAdmin({
    userId: session.user.id,
    sessionId: session.session.id,
  });

  return authorizePlatformSession({
    userId: session.user.id,
    sessionId: session.session.id,
    permission,
  });
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
) {
  const access = await getPlatformAccess(permission);
  if (!access.allowed) notFound();
  return access;
}
