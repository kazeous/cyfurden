export const ACCOUNT_DISPLAY_NAME_MIN_VISIBLE = 2;
export const ACCOUNT_DISPLAY_NAME_MAX_VISIBLE = 80;
export const ACCOUNT_DISPLAY_NAME_MAX_INPUT = 240;

export type AccountDisplayNameError = "required" | "length" | "too-long";

export type AccountDisplayNameResult =
  | {
      ok: true;
      value: string;
      visibleCharacters: number;
    }
  | {
      ok: false;
      error: AccountDisplayNameError;
    };

export function normalizeAccountDisplayName(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function countVisibleCharacters(value: string): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(value), ({ segment }) => segment).filter(
    (segment) => /[^\p{White_Space}\p{Cc}\p{Cf}\p{Cs}]/u.test(segment),
  ).length;
}

export function validateAccountDisplayName(
  value: unknown,
): AccountDisplayNameResult {
  if (typeof value !== "string") {
    return { ok: false, error: "required" };
  }

  if (value.length > ACCOUNT_DISPLAY_NAME_MAX_INPUT) {
    return { ok: false, error: "too-long" };
  }

  const normalized = normalizeAccountDisplayName(value);
  if (!normalized) {
    return { ok: false, error: "required" };
  }

  const visibleCharacters = countVisibleCharacters(normalized);
  if (
    visibleCharacters < ACCOUNT_DISPLAY_NAME_MIN_VISIBLE ||
    visibleCharacters > ACCOUNT_DISPLAY_NAME_MAX_VISIBLE
  ) {
    return { ok: false, error: "length" };
  }

  return {
    ok: true,
    value: normalized,
    visibleCharacters,
  };
}
