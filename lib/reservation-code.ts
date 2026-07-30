export const reservationCodePattern = /^CYF-[A-F0-9]{20}$/;

export function parseReservationCode(value: unknown): string | null {
  return typeof value === "string" && reservationCodePattern.test(value)
    ? value
    : null;
}

export function reservationPath(slug: string, code: string): string {
  return `/s/${encodeURIComponent(slug)}/reservation/${encodeURIComponent(code)}`;
}
