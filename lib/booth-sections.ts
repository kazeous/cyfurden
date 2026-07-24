export const boothSectionIds = [
  "storefront",
  "orders",
  "products",
  "gacha",
  "team",
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
