export const platformRoles = [
  "PLATFORM_VIEWER",
  "PLATFORM_OPERATOR",
  "PLATFORM_SUPER_ADMIN",
] as const;

export type PlatformRoleName = (typeof platformRoles)[number];

export const platformPermissions = [
  "platform.read",
  "user.suspend",
  "user.session.revoke",
  "membership.manage",
  "booth.suspend",
  "quota.manage",
  "storage.reconcile",
  "deletion.request",
  "deletion.finalize",
  "ownership.transfer",
  "platform_role.manage",
  "audit.read",
] as const;

export type PlatformPermission = (typeof platformPermissions)[number];

const viewerPermissions = [
  "platform.read",
  "audit.read",
] as const satisfies readonly PlatformPermission[];

const operatorPermissions = [
  ...viewerPermissions,
  "user.suspend",
  "user.session.revoke",
  "membership.manage",
  "booth.suspend",
  "quota.manage",
  "storage.reconcile",
  "deletion.request",
] as const satisfies readonly PlatformPermission[];

export const platformPermissionMatrix = {
  PLATFORM_VIEWER: viewerPermissions,
  PLATFORM_OPERATOR: operatorPermissions,
  PLATFORM_SUPER_ADMIN: [
    ...operatorPermissions,
    "deletion.finalize",
    "ownership.transfer",
    "platform_role.manage",
  ],
} as const satisfies Record<PlatformRoleName, readonly PlatformPermission[]>;

export function platformRoleHasPermission(
  role: PlatformRoleName,
  permission: PlatformPermission,
) {
  return (
    platformPermissionMatrix[role] as readonly PlatformPermission[]
  ).includes(permission);
}

export const platformPolicy = {
  auth: {
    bootstrapEnvironmentVariable: "PLATFORM_SUPER_ADMIN_USER_ID",
    requiresCredentialAccount: true,
    requiresVerifiedTotp: true,
    allowImpersonation: false,
    destructiveStepUpMaxAgeMs: 15 * 60 * 1_000,
  },
  deletion: {
    coolingOffDays: 7,
    coolingOffMs: 7 * 24 * 60 * 60 * 1_000,
    hardDeleteBoothWithOrders: false,
    hardDeleteUserWithOwnedBoothsOrRetainedReferences: false,
  },
  quotaDefaults: {
    maxOwnedBooths: 5,
    maxTeamSeats: 10,
    maxProducts: 500,
    maxFaceboothProjects: 100,
    maxStorageBytes: BigInt(5) * BigInt(1_024) * BigInt(1_024) * BigInt(1_024),
  },
  availability: {
    en: "Current health",
    vi: "Tình trạng hiện tại",
    historicalUptimeEnabled: false,
  },
  platformIdentityFields: [
    "id",
    "name",
    "email",
    "emailVerified",
    "banned",
    "banReason",
    "banExpires",
    "createdAt",
    "updatedAt",
  ],
  prohibitedPlatformData: [
    "order contents",
    "customer addresses",
    "customer notes",
    "bank details",
    "transfer references",
    "payment data",
  ],
} as const;

export const betterAuthPlatformRoles = {
  user: {
    user: [] as const,
    session: [] as const,
  },
  PLATFORM_VIEWER: {
    user: [] as const,
    session: [] as const,
  },
  PLATFORM_OPERATOR: {
    user: ["ban"] as const,
    session: ["revoke"] as const,
  },
  PLATFORM_SUPER_ADMIN: {
    user: ["ban"] as const,
    session: ["revoke"] as const,
  },
} as const;
