export const orderAlertsChangedEvent = "cyfurden:order-alerts-changed";

export type LatestOrderSignal = {
  id: string;
  code: string;
  placedAt: string;
  status: string;
};

export function orderAlertsStorageKey(boothId: string) {
  return `cyfurden:order-alerts:${boothId}`;
}

export function isNewPendingOrder(
  previous: LatestOrderSignal | null,
  next: LatestOrderSignal | null,
) {
  if (!next || next.status !== "PENDING") return false;
  if (!previous) return true;

  const previousTime = Date.parse(previous.placedAt);
  const nextTime = Date.parse(next.placedAt);
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) {
    return previous.id !== next.id;
  }
  if (nextTime !== previousTime) return nextTime > previousTime;
  return previous.id !== next.id;
}
