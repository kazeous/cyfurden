export const boothSectionIds = [
  "storefront",
  "orders",
  "products",
  "gacha",
  "team",
  "settings",
] as const;

export type BoothSectionId = (typeof boothSectionIds)[number];
export type BoothSectionRole = "OWNER" | "ADMIN" | "STAFF";

export function canAccessBoothSection(role: string, section: BoothSectionId) {
  const normalizedRole = role.toUpperCase() as BoothSectionRole;
  return (
    normalizedRole === "OWNER" ||
    normalizedRole === "ADMIN" ||
    (normalizedRole === "STAFF" && section === "orders")
  );
}

export function getDefaultBoothSection(role: string, boothStatus: string) {
  return role.toUpperCase() === "STAFF" || boothStatus === "PUBLISHED"
    ? ("orders" as const)
    : ("storefront" as const);
}
