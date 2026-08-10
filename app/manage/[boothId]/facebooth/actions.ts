"use server";

import { requireBoothRole } from "@/lib/authorization";
import {
  createFaceboothProject,
  deleteFaceboothProject,
  duplicateFaceboothProject,
  importFaceboothProject,
  listFaceboothProjectsForManager,
  publishFaceboothSnapshot,
  readFaceboothProjectForManager,
  renameFaceboothProject,
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

export async function importFaceboothProjectAction(
  boothId: string,
  project: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return importFaceboothProject({
    boothId,
    actorUserId: session.user.id,
    project,
  });
}

export async function renameFaceboothProjectAction(
  boothId: string,
  projectId: string,
  rename: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return renameFaceboothProject({
    boothId,
    projectId,
    actorUserId: session.user.id,
    rename,
  });
}

export async function duplicateFaceboothProjectAction(
  boothId: string,
  projectId: string,
  name: unknown,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return duplicateFaceboothProject({
    boothId,
    projectId,
    actorUserId: session.user.id,
    name,
  });
}

export async function deleteFaceboothProjectAction(
  boothId: string,
  projectId: string,
) {
  const { session } = await requireBoothRole(boothId, faceboothManagerRoles);
  return deleteFaceboothProject({
    boothId,
    projectId,
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
