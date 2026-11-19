import { BOOTH_UTC_OFFSET_MILLISECONDS } from "@/lib/booth-time";
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type OrderViewMode = "queue" | "events";
export type EventSelection = "ALL" | string;
export type EventPeriod = "upcoming" | "live" | "ended";

export type EventDateRange = {
  startsAt: Date;
  endsAt: Date;
};

function parseCalendarDate(value: string) {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  return utc;
}

export function parseEventDateRange(
  startDate: string,
  endDate: string,
): EventDateRange | null {
  const localStart = parseCalendarDate(startDate);
  const localEnd = parseCalendarDate(endDate);
  if (!localStart || !localEnd || localEnd < localStart) return null;

  return {
    startsAt: new Date(localStart.getTime() - BOOTH_UTC_OFFSET_MILLISECONDS),
    endsAt: new Date(
      localEnd.getTime() - BOOTH_UTC_OFFSET_MILLISECONDS + DAY_MILLISECONDS,
    ),
  };
}

export function eventDateInput(date: Date, exclusiveEnd = false) {
  const localTime = new Date(
    date.getTime() + BOOTH_UTC_OFFSET_MILLISECONDS - (exclusiveEnd ? 1 : 0),
  );
  return [
    localTime.getUTCFullYear(),
    String(localTime.getUTCMonth() + 1).padStart(2, "0"),
    String(localTime.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function eventPeriod(
  event: EventDateRange,
  referenceTime = new Date(),
): EventPeriod {
  if (referenceTime < event.startsAt) return "upcoming";
  if (referenceTime >= event.endsAt) return "ended";
  return "live";
}

export function parseOrderViewMode(
  value: string | string[] | undefined,
): OrderViewMode {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "events" ? "events" : "queue";
}

export function resolveEventSelection(
  value: string | string[] | undefined,
  eventIds: readonly string[],
): EventSelection {
  const first = Array.isArray(value) ? value[0] : value;
  return first && eventIds.includes(first) ? first : "ALL";
}

export function orderEventWhere(
  mode: OrderViewMode,
  selection: EventSelection,
) {
  if (mode === "queue") return {};
  if (selection === "ALL") return { eventId: { not: null } };
  return { eventId: selection };
}
