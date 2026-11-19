/**
 * Cyfurden booths operate on Vietnam time. Every business timestamp shown to
 * people, and every wall-clock value they type, uses this zone instead of the
 * host's: production containers run in UTC while local machines may not.
 */
export const BOOTH_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Vietnam observes no daylight saving time, so the offset is fixed. */
export const BOOTH_UTC_OFFSET_MILLISECONDS = 7 * 60 * 60 * 1000;

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Reads an `<input type="datetime-local">` value as Vietnam wall-clock time.
 * Returns null for malformed, zoned, or impossible calendar values.
 */
export function parseBoothLocalDateTime(value: string): Date | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wallClock = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  if (
    wallClock.getUTCFullYear() !== year ||
    wallClock.getUTCMonth() !== month - 1 ||
    wallClock.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(wallClock.getTime() - BOOTH_UTC_OFFSET_MILLISECONDS);
}
