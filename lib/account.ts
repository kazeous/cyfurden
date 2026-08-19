import "server-only";
import { db } from "@/lib/db";

export type AccountProviderKind = "credential" | "google" | string;

export type CurrentAccount = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  providerKinds: AccountProviderKind[];
  credentialEnabled: boolean;
  twoFactorEnabled: boolean;
  platformGrantActive: boolean;
};

const providerOrder = new Map([
  ["credential", 0],
  ["google", 1],
]);

export async function readCurrentAccount(
  currentUserId: string,
): Promise<CurrentAccount> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: currentUserId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      twoFactorEnabled: true,
      accounts: {
        select: { providerId: true },
      },
      platformRoleGrant: {
        select: { status: true },
      },
    },
  });
  const providerKinds = Array.from(
    new Set(user.accounts.map(({ providerId }) => providerId)),
  ).sort(
    (left, right) =>
      (providerOrder.get(left) ?? 99) - (providerOrder.get(right) ?? 99) ||
      left.localeCompare(right),
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    providerKinds,
    credentialEnabled: providerKinds.includes("credential"),
    twoFactorEnabled: user.twoFactorEnabled === true,
    platformGrantActive: user.platformRoleGrant?.status === "ACTIVE",
  };
}
