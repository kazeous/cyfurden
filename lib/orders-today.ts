const HO_CHI_MINH_UTC_OFFSET_MILLISECONDS = 7 * 60 * 60 * 1000;

export function hoChiMinhTodayWindow(referenceTime = new Date()) {
  const hoChiMinhTime = new Date(
    referenceTime.getTime() + HO_CHI_MINH_UTC_OFFSET_MILLISECONDS,
  );
  const start = new Date(
    Date.UTC(
      hoChiMinhTime.getUTCFullYear(),
      hoChiMinhTime.getUTCMonth(),
      hoChiMinhTime.getUTCDate(),
    ) - HO_CHI_MINH_UTC_OFFSET_MILLISECONDS,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { gte: start, lt: end };
}

export function parseTodayQuery(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "1";
}
