import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  canAccessBoothSection,
  type BoothSectionId,
} from "@/lib/booth-sections";
import { db } from "@/lib/db";

export type BoothRoleName = "OWNER" | "ADMIN" | "STAFF";

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireUser(returnTo = "/dashboard") {
  const session = await getCurrentSession();
  if (!session) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}

export async function requireBoothMember(boothId: string) {
  const session = await requireUser(`/manage/${boothId}/orders`);
  const membership = await db.boothMembership.findFirst({
    where: {
      boothId,
      userId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      booth: true,
    },
  });

  if (!membership) {
    notFound();
  }

  return { session, membership, booth: membership.booth };
}

export async function requireBoothRole(
  boothId: string,
  allowedRoles: readonly BoothRoleName[],
) {
  const context = await requireBoothMember(boothId);
  if (!allowedRoles.includes(context.membership.role)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return context;
}

export async function requireBoothSection(
  boothId: string,
  section: BoothSectionId,
) {
  const context = await requireBoothMember(boothId);
  if (!canAccessBoothSection(context.membership.role, section)) {
    redirect(`/manage/${boothId}/orders`);
  }
  return context;
}
