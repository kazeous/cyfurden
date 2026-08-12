import { db } from "@/lib/db";

export type PlatformTargetReference =
  | { type: "USER"; id: string }
  | { type: "BOOTH"; id: string };

export type PlatformTargetState = "ACTIVE" | "SUSPENDED" | "DELETION_PENDING";

export type PlatformTargetAction =
  | "READ"
  | "SUSPEND"
  | "RESTORE"
  | "REVOKE_SESSIONS"
  | "MANAGE_MEMBERSHIP"
  | "MANAGE_QUOTA"
  | "RECONCILE_STORAGE"
  | "REQUEST_DELETION"
  | "CANCEL_DELETION"
  | "FINALIZE_DELETION"
  | "TRANSFER_OWNERSHIP"
  | "MANAGE_PLATFORM_ROLE";

export class PlatformTargetError extends Error {
  constructor(
    public readonly code:
      | "TARGET_NOT_FOUND"
      | "TARGET_TYPE_MISMATCH"
      | "TARGET_STATE_CONFLICT"
      | "STALE_TARGET_VERSION"
      | "BOOTH_UNAVAILABLE"
      | "BOOTH_READ_ONLY",
  ) {
    super(code);
    this.name = "PlatformTargetError";
  }
}

export type ResolvedPlatformTarget =
  | {
      type: "USER";
      id: string;
      state: PlatformTargetState;
      version: null;
    }
  | {
      type: "BOOTH";
      id: string;
      state: PlatformTargetState;
      version: number;
    };

export async function resolvePlatformTarget(
  reference: PlatformTargetReference,
  now = new Date(),
): Promise<ResolvedPlatformTarget | null> {
  if (reference.type === "USER") {
    const [user, deletion] = await Promise.all([
      db.user.findUnique({
        where: { id: reference.id },
        select: { id: true, banned: true, banExpires: true },
      }),
      db.platformDeletionRequest.findFirst({
        where: {
          targetType: "USER",
          targetId: reference.id,
          state: { in: ["PENDING", "FINALIZING", "BLOCKED"] },
        },
        select: { id: true },
      }),
    ]);
    if (!user) return null;
    const suspended =
      user.banned === true &&
      (!user.banExpires || user.banExpires.getTime() > now.getTime());
    return {
      type: "USER",
      id: user.id,
      state: deletion ? "DELETION_PENDING" : suspended ? "SUSPENDED" : "ACTIVE",
      version: null,
    };
  }

  const booth = await db.booth.findUnique({
    where: { id: reference.id },
    select: { id: true, serviceState: true, serviceVersion: true },
  });
  return booth
    ? {
        type: "BOOTH",
        id: booth.id,
        state: booth.serviceState,
        version: booth.serviceVersion,
      }
    : null;
}

const actionStates = {
  READ: ["ACTIVE", "SUSPENDED", "DELETION_PENDING"],
  SUSPEND: ["ACTIVE"],
  RESTORE: ["SUSPENDED"],
  REVOKE_SESSIONS: ["ACTIVE", "SUSPENDED", "DELETION_PENDING"],
  MANAGE_MEMBERSHIP: ["ACTIVE"],
  MANAGE_QUOTA: ["ACTIVE", "SUSPENDED"],
  RECONCILE_STORAGE: ["ACTIVE", "SUSPENDED", "DELETION_PENDING"],
  REQUEST_DELETION: ["ACTIVE", "SUSPENDED"],
  CANCEL_DELETION: ["DELETION_PENDING"],
  FINALIZE_DELETION: ["DELETION_PENDING"],
  TRANSFER_OWNERSHIP: ["ACTIVE"],
  MANAGE_PLATFORM_ROLE: ["ACTIVE"],
} as const satisfies Record<
  PlatformTargetAction,
  readonly PlatformTargetState[]
>;

const userOnlyActions = new Set<PlatformTargetAction>([
  "REVOKE_SESSIONS",
  "MANAGE_PLATFORM_ROLE",
]);

const boothOnlyActions = new Set<PlatformTargetAction>([
  "MANAGE_MEMBERSHIP",
  "RECONCILE_STORAGE",
  "TRANSFER_OWNERSHIP",
]);

export function assertPlatformTargetAction(input: {
  target: ResolvedPlatformTarget;
  action: PlatformTargetAction;
  expectedVersion?: number;
}) {
  if (userOnlyActions.has(input.action) && input.target.type !== "USER") {
    throw new PlatformTargetError("TARGET_TYPE_MISMATCH");
  }
  if (boothOnlyActions.has(input.action) && input.target.type !== "BOOTH") {
    throw new PlatformTargetError("TARGET_TYPE_MISMATCH");
  }
  if (
    input.expectedVersion !== undefined &&
    input.target.version !== input.expectedVersion
  ) {
    throw new PlatformTargetError("STALE_TARGET_VERSION");
  }
  if (
    !(actionStates[input.action] as readonly PlatformTargetState[]).includes(
      input.target.state,
    )
  ) {
    throw new PlatformTargetError("TARGET_STATE_CONFLICT");
  }
  return input.target;
}

export async function requirePlatformTarget(input: {
  reference: PlatformTargetReference;
  action: PlatformTargetAction;
  expectedVersion?: number;
}) {
  const target = await resolvePlatformTarget(input.reference);
  if (!target) throw new PlatformTargetError("TARGET_NOT_FOUND");
  return assertPlatformTargetAction({
    target,
    action: input.action,
    expectedVersion: input.expectedVersion,
  });
}

export function assertBoothServiceAccess(
  state: PlatformTargetState,
  access: "PUBLIC_READ" | "MEMBER_READ" | "MUTATION",
) {
  if (state === "ACTIVE") return;
  if (access === "MEMBER_READ") return;
  throw new PlatformTargetError(
    access === "PUBLIC_READ" ? "BOOTH_UNAVAILABLE" : "BOOTH_READ_ONLY",
  );
}
