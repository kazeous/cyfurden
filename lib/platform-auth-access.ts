import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  user: ["ban"],
  session: ["revoke"],
} as const;

export const platformAuthAccessControl = createAccessControl(statement);

const noAuthAdministration = platformAuthAccessControl.newRole({
  user: [],
  session: [],
});

const boundedOperatorAdministration = platformAuthAccessControl.newRole({
  user: ["ban"],
  session: ["revoke"],
});

export const platformAuthRoles = {
  user: noAuthAdministration,
  PLATFORM_VIEWER: noAuthAdministration,
  PLATFORM_OPERATOR: boundedOperatorAdministration,
  PLATFORM_SUPER_ADMIN: boundedOperatorAdministration,
};
