export const MAX_PRODUCT_PRICE_VND = 9_000_000_000_000;
export const PRODUCT_SKU_MAX_LENGTH = 80;

const PRODUCT_SKU_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._-]{0,79}$/u;

export function normalizeProductSku(value: string) {
  return value.trim().toLocaleUpperCase("vi-VN");
}

export function isValidProductSku(value: string) {
  return (
    value.length <= PRODUCT_SKU_MAX_LENGTH && PRODUCT_SKU_PATTERN.test(value)
  );
}

export function parseWholeVndPrice(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isSafeInteger(price) &&
    price >= 0 &&
    price <= MAX_PRODUCT_PRICE_VND
    ? price
    : null;
}
