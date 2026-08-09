"use server";

import { requireBoothRole } from "@/lib/authorization";
import {
  createFaceboothProject,
  listFaceboothProjectsForManager,
  publishFaceboothSnapshot,
  readFaceboothProjectForManager,
  saveFaceboothProject,
} from "@/lib/facebooth-projects";
import { verifyFaceboothUploadForManager } from "@/lib/facebooth-uploads";
import type { FaceboothUploadPurpose } from "@/lib/oracle-presign-contract";

const faceboothManagerRoles = ["OWNER", "ADMIN"] as const;

export async function createFaceboothProjectAction(
  boothId: string,
  project: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return createFaceboothProject({
    boothId,
    actorUserId: session.user.id,
    project,
  });
}

export async function readFaceboothProjectAction(
  boothId: string,
  projectId: string,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return readFaceboothProjectForManager({
    boothId,
    projectId,
    actorUserId: session.user.id,
  });
}

export async function listFaceboothProjectsAction(boothId: string) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return listFaceboothProjectsForManager({
    boothId,
    actorUserId: session.user.id,
  });
}

export async function saveFaceboothProjectAction(
  boothId: string,
  projectId: string,
  project: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return saveFaceboothProject({
    boothId,
    projectId,
    actorUserId: session.user.id,
    project,
  });
}

export async function verifyFaceboothUploadAction(
  boothId: string,
  purpose: FaceboothUploadPurpose,
  objectKey: string,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return verifyFaceboothUploadForManager({
    boothId,
    actorUserId: session.user.id,
    purpose,
    objectKey,
  });
}

export async function publishFaceboothSnapshotAction(
  boothId: string,
  publication: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return publishFaceboothSnapshot({
    boothId,
    actorUserId: session.user.id,
    publication,
  });
}
