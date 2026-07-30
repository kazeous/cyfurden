export const MAX_OWNED_BOOTHS = 5;

export const OWNED_BOOTH_LIMIT_MESSAGE =
  "You can own up to 5 booths. Manage an existing booth before creating another one.";

export function canOwnAnotherBooth(ownedBoothCount: number) {
  return ownedBoothCount < MAX_OWNED_BOOTHS;
}

export function countOwnedBooths(
  userId: string,
  booths: ReadonlyArray<{ ownerId: string }>,
) {
  return booths.filter((booth) => booth.ownerId === userId).length;
}
