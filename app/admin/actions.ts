"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/authorization";
import { parseBoothLocalDateTime } from "@/lib/booth-time";
import { getPlatformAdminStrings } from "@/lib/i18n/platform-admin";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { deleteOracleObjectsStrict } from "@/lib/oracle-uploads";
import {
  cancelPlatformDeletion,
  finalizePlatformBoothDeletion,
  finalizePlatformOwnershipTransfer,
  finalizePlatformUserDeletion,
  PlatformLifecycleError,
  type PlatformLifecycleErrorCode,
  previewPlatformDeletion,
  previewPlatformOwnershipTransfer,
  requestPlatformDeletion,
  restorePlatformBooth,
  restorePlatformUser,
  restrictPlatformMembership,
  revokePlatformUserSessions,
  suspendPlatformBooth,
  suspendPlatformUser,
} from "@/lib/platform-lifecycle";
import {
  PlatformQuotaMutationError,
  updateBoothQuotaOverride,
  updatePlatformQuotaDefaults,
  updateUserQuotaOverride,
} from "@/lib/platform-quotas";
import {
  reconcileBoothStorage,
  StorageReconciliationError,
} from "@/lib/storage-reconciliation";

export type PlatformLifecycleActionState = {
  status: "idle" | "success" | "error" | "preview";
  message: string;
  code?: PlatformLifecycleErrorCode;
  details?: string[];
};

export type PlatformResourceActionState = {
  status: "idle" | "success" | "error" | "running";
  message: string;
};

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function positiveInteger(formData: FormData, key: string) {
  const value = Number.parseInt(text(formData, key), 10);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function optionalQuotaInteger(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  return /^\d{1,10}$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
}

function optionalStorageBytes(formData: FormData) {
  const mebibytes = text(formData, "maxStorageMiB");
  if (!mebibytes) return null;
  if (!/^\d{1,10}$/.test(mebibytes)) return BigInt(0);
  return BigInt(mebibytes) * BigInt(1_024) * BigInt(1_024);
}

function optionalDateTime(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  // An invalid Date lets the lifecycle service reject it as INVALID_EXPIRY.
  return parseBoothLocalDateTime(value) ?? new Date(Number.NaN);
}

async function actionContext() {
  const [session, locale] = await Promise.all([
    getCurrentSession(),
    readLocaleCookie(),
  ]);
  if (!session) throw new PlatformLifecycleError("AUTHORIZATION_DENIED");
  return {
    actorUserId: session.user.id,
    actorSessionId: session.session.id,
    locale,
    strings: getPlatformAdminStrings(locale),
  };
}

function lifecycleErrorMessage(
  error: unknown,
  strings: ReturnType<typeof getPlatformAdminStrings>,
) {
  if (error instanceof PlatformLifecycleError) {
    return strings.lifecycle.errors[error.code];
  }
  return strings.lifecycle.errors.CONCURRENT_UPDATE;
}

function resultState(
  result: { status: string },
  strings: ReturnType<typeof getPlatformAdminStrings>,
): PlatformLifecycleActionState {
  if (result.status === "BLOCKED") {
    return {
      status: "error",
      message: strings.lifecycle.errors.STATE_CONFLICT,
    };
  }
  if (result.status === "PROVIDER_BLOCKED") {
    return {
      status: "error",
      message: strings.lifecycle.errors.PROVIDER_DELETE_FAILED,
    };
  }
  return { status: "success", message: strings.lifecycle.success };
}

export async function platformUserLifecycleAction(
  _previousState: PlatformLifecycleActionState,
  formData: FormData,
): Promise<PlatformLifecycleActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const targetUserId = text(formData, "targetUserId");
    const reason = text(formData, "reason");
    const intent = text(formData, "intent");
    const actor = {
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
    };
    let result: { status: string };
    switch (intent) {
      case "suspend":
        result = await suspendPlatformUser({
          ...actor,
          targetUserId,
          reason,
          banExpires: optionalDateTime(formData, "banExpires"),
        });
        break;
      case "restore":
        result = await restorePlatformUser({
          ...actor,
          targetUserId,
          reason,
        });
        break;
      case "revoke-sessions":
        result = await revokePlatformUserSessions({
          ...actor,
          targetUserId,
          reason,
        });
        break;
      case "request-deletion":
        result = await requestPlatformDeletion({
          ...actor,
          targetType: "USER",
          targetId: targetUserId,
          reason,
        });
        break;
      case "cancel-deletion":
        result = await cancelPlatformDeletion({
          ...actor,
          targetType: "USER",
          targetId: targetUserId,
          reason,
        });
        break;
      case "finalize-deletion":
        result = await finalizePlatformUserDeletion({
          ...actor,
          targetUserId,
          confirmation: text(formData, "confirmation"),
          reason,
        });
        break;
      case "preview-deletion": {
        const preview = await previewPlatformDeletion({
          ...actor,
          targetType: "USER",
          targetId: targetUserId,
        });
        if (preview.targetType !== "USER") {
          throw new PlatformLifecycleError("STATE_CONFLICT");
        }
        return {
          status: "preview",
          message: context.strings.lifecycle.previewCurrent,
          details: [
            `${context.strings.common.owner}: ${preview.blockers.ownedBooths}`,
            `${context.strings.common.targetLabel("retained references")}: ${preview.blockers.retainedReferences}`,
            `${context.strings.lifecycle.confirmation}: ${preview.confirmation}`,
          ],
        };
      }
      default:
        throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    revalidatePath(`/admin/users/${encodeURIComponent(targetUserId)}`);
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return resultState(result, context.strings);
  } catch (error) {
    if (!(error instanceof PlatformLifecycleError)) {
      console.error("Platform user lifecycle action failed", error);
    }
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return {
      status: "error",
      message: lifecycleErrorMessage(error, fallback),
      code: error instanceof PlatformLifecycleError ? error.code : undefined,
    };
  }
}

export async function platformBoothLifecycleAction(
  _previousState: PlatformLifecycleActionState,
  formData: FormData,
): Promise<PlatformLifecycleActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const boothId = text(formData, "boothId");
    const expectedVersion = positiveInteger(formData, "expectedVersion");
    const reason = text(formData, "reason");
    const intent = text(formData, "intent");
    const actor = {
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
    };
    let result: { status: string };
    switch (intent) {
      case "suspend":
        result = await suspendPlatformBooth({
          ...actor,
          boothId,
          expectedVersion,
          reason,
        });
        break;
      case "restore":
        result = await restorePlatformBooth({
          ...actor,
          boothId,
          expectedVersion,
          reason,
        });
        break;
      case "membership": {
        const membershipRole = text(formData, "membershipRole");
        const membershipStatus = text(formData, "membershipStatus");
        if (
          !["ADMIN", "STAFF"].includes(membershipRole) ||
          !["ACTIVE", "DISABLED"].includes(membershipStatus)
        ) {
          throw new PlatformLifecycleError("INVALID_MEMBERSHIP_INPUT");
        }
        result = await restrictPlatformMembership({
          ...actor,
          boothId,
          membershipId: text(formData, "membershipId"),
          role: membershipRole as "ADMIN" | "STAFF",
          status: membershipStatus as "ACTIVE" | "DISABLED",
          reason,
        });
        break;
      }
      case "request-deletion":
        result = await requestPlatformDeletion({
          ...actor,
          targetType: "BOOTH",
          targetId: boothId,
          expectedVersion,
          reason,
        });
        break;
      case "cancel-deletion":
        result = await cancelPlatformDeletion({
          ...actor,
          targetType: "BOOTH",
          targetId: boothId,
          expectedVersion,
          reason,
        });
        break;
      case "finalize-deletion":
        result = await finalizePlatformBoothDeletion({
          ...actor,
          boothId,
          expectedVersion,
          confirmation: text(formData, "confirmation"),
          reason,
          deleteObjects: deleteOracleObjectsStrict,
        });
        break;
      case "preview-deletion": {
        const preview = await previewPlatformDeletion({
          ...actor,
          targetType: "BOOTH",
          targetId: boothId,
        });
        if (preview.targetType !== "BOOTH") {
          throw new PlatformLifecycleError("STATE_CONFLICT");
        }
        return {
          status: "preview",
          message: context.strings.lifecycle.previewCurrent,
          details: [
            `${context.strings.boothDetail.orderBlockers}: ${preview.blockers.retainedOrderReferences}`,
            `${context.strings.common.targetLabel("oracle objects")}: ${preview.blockers.oracleObjectCount}`,
            `${context.strings.lifecycle.confirmation}: ${preview.confirmation}`,
          ],
        };
      }
      case "preview-ownership": {
        const preview = await previewPlatformOwnershipTransfer({
          ...actor,
          boothId,
          recipientUserId: text(formData, "recipientUserId"),
        });
        return {
          status: "preview",
          message: context.strings.boothDetail.ownershipImpact,
          details: [
            `${context.strings.common.owner}: ${preview.currentOwner.name} → ${preview.recipient.name}`,
            `${context.strings.common.roleLabel("OWNER")} → ${context.strings.common.roleLabel("ADMIN")}: ${preview.currentOwner.email}`,
            `${context.strings.lifecycle.confirmation}: ${preview.confirmation}`,
          ],
        };
      }
      case "finalize-ownership":
        result = await finalizePlatformOwnershipTransfer({
          ...actor,
          boothId,
          recipientUserId: text(formData, "recipientUserId"),
          expectedVersion,
          confirmation: text(formData, "confirmation"),
          reason,
        });
        break;
      default:
        throw new PlatformLifecycleError("STATE_CONFLICT");
    }
    revalidatePath(`/admin/booths/${encodeURIComponent(boothId)}`);
    revalidatePath("/admin/booths");
    revalidatePath("/admin");
    revalidatePath(`/manage/${encodeURIComponent(boothId)}`, "layout");
    return resultState(result, context.strings);
  } catch (error) {
    if (!(error instanceof PlatformLifecycleError)) {
      console.error("Platform booth lifecycle action failed", error);
    }
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return {
      status: "error",
      message: lifecycleErrorMessage(error, fallback),
      code: error instanceof PlatformLifecycleError ? error.code : undefined,
    };
  }
}

function resourceErrorMessage(
  error: unknown,
  strings: ReturnType<typeof getPlatformAdminStrings>,
) {
  if (
    error instanceof PlatformQuotaMutationError ||
    error instanceof StorageReconciliationError
  ) {
    return strings.resourceControls.errors[error.code];
  }
  if (error instanceof PlatformLifecycleError) {
    return strings.resourceControls.errors.AUTHORIZATION_DENIED;
  }
  return strings.resourceControls.errors.CONCURRENT_UPDATE;
}

export async function platformUserQuotaAction(
  _previousState: PlatformResourceActionState,
  formData: FormData,
): Promise<PlatformResourceActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const targetUserId = text(formData, "targetUserId");
    const result = await updateUserQuotaOverride({
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
      targetUserId,
      maxOwnedBooths: optionalQuotaInteger(formData, "maxOwnedBooths"),
      reason: text(formData, "reason"),
    });
    revalidatePath(`/admin/users/${encodeURIComponent(targetUserId)}`);
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return {
      status: "success",
      message:
        result.status === "NO_CHANGE"
          ? context.strings.resourceControls.noChange
          : context.strings.resourceControls.quotaSuccess,
    };
  } catch (error) {
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return { status: "error", message: resourceErrorMessage(error, fallback) };
  }
}

export async function platformDefaultQuotaAction(
  _previousState: PlatformResourceActionState,
  formData: FormData,
): Promise<PlatformResourceActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const result = await updatePlatformQuotaDefaults({
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
      maxOwnedBooths:
        optionalQuotaInteger(formData, "maxOwnedBooths") ?? Number.NaN,
      maxTeamSeats:
        optionalQuotaInteger(formData, "maxTeamSeats") ?? Number.NaN,
      maxProducts: optionalQuotaInteger(formData, "maxProducts") ?? Number.NaN,
      maxFaceboothProjects:
        optionalQuotaInteger(formData, "maxFaceboothProjects") ?? Number.NaN,
      maxStorageBytes: optionalStorageBytes(formData) ?? BigInt(0),
      reason: text(formData, "reason"),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/users");
    revalidatePath("/admin/booths");
    revalidatePath("/admin/storage");
    return {
      status: "success",
      message:
        result.status === "NO_CHANGE"
          ? context.strings.resourceControls.noChange
          : context.strings.resourceControls.quotaSuccess,
    };
  } catch (error) {
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return { status: "error", message: resourceErrorMessage(error, fallback) };
  }
}

export async function platformBoothQuotaAction(
  _previousState: PlatformResourceActionState,
  formData: FormData,
): Promise<PlatformResourceActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const boothId = text(formData, "boothId");
    const result = await updateBoothQuotaOverride({
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
      boothId,
      maxTeamSeats: optionalQuotaInteger(formData, "maxTeamSeats"),
      maxProducts: optionalQuotaInteger(formData, "maxProducts"),
      maxFaceboothProjects: optionalQuotaInteger(
        formData,
        "maxFaceboothProjects",
      ),
      maxStorageBytes: optionalStorageBytes(formData),
      reason: text(formData, "reason"),
    });
    revalidatePath(`/admin/booths/${encodeURIComponent(boothId)}`);
    revalidatePath("/admin/booths");
    revalidatePath("/admin/storage");
    revalidatePath("/admin");
    return {
      status: "success",
      message:
        result.status === "NO_CHANGE"
          ? context.strings.resourceControls.noChange
          : context.strings.resourceControls.quotaSuccess,
    };
  } catch (error) {
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return { status: "error", message: resourceErrorMessage(error, fallback) };
  }
}

export async function platformStorageReconciliationAction(
  _previousState: PlatformResourceActionState,
  formData: FormData,
): Promise<PlatformResourceActionState> {
  let strings: ReturnType<typeof getPlatformAdminStrings> | null = null;
  try {
    const context = await actionContext();
    strings = context.strings;
    const boothId = text(formData, "boothId");
    const result = await reconcileBoothStorage({
      actorUserId: context.actorUserId,
      actorSessionId: context.actorSessionId,
      boothId,
      reason: text(formData, "reason"),
    });
    revalidatePath(`/admin/booths/${encodeURIComponent(boothId)}`);
    revalidatePath("/admin/storage");
    revalidatePath("/admin");
    return result.status === "RUNNING"
      ? {
          status: "running",
          message: context.strings.resourceControls.reconciliationRunning,
        }
      : {
          status: "success",
          message: context.strings.resourceControls.reconciliationSuccess,
        };
  } catch (error) {
    const fallback =
      strings ?? getPlatformAdminStrings(await readLocaleCookie());
    return { status: "error", message: resourceErrorMessage(error, fallback) };
  }
}
