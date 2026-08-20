export function normalizePlatformSecurityReturnTo(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/admin") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://cyfurden.invalid");
    if (
      parsed.origin !== "https://cyfurden.invalid" ||
      !/^\/admin(?:\/|$)/.test(parsed.pathname)
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
