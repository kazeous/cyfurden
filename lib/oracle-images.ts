export interface OracleImageAsset {
  objectKey: string;
  alt: string;
  width: number;
  height: number;
}

const encodeObjectKeySegment = (segment: string) =>
  encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Resolves an Oracle Object Storage key against the public bucket or CDN base.
 *
 * The base URL is intentionally public configuration. OCI credentials, private
 * keys, and tenancy details must never be exposed through a NEXT_PUBLIC value.
 */
export function resolveOracleObjectUrl(
  objectKey: string,
  publicBaseUrl = process.env.NEXT_PUBLIC_ORACLE_OBJECT_BASE_URL,
): string | undefined {
  if (!publicBaseUrl?.trim()) {
    return undefined;
  }

  const segments = objectKey
    .trim()
    .split("/")
    .filter((segment) => segment.length > 0);

  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return undefined;
  }

  try {
    const resolvedUrl = new URL(publicBaseUrl.trim());

    if (resolvedUrl.protocol !== "https:" && resolvedUrl.protocol !== "http:") {
      return undefined;
    }

    const encodedObjectKey = segments.map(encodeObjectKeySegment).join("/");
    const basePath = resolvedUrl.pathname.replace(/\/+$/, "");

    resolvedUrl.pathname = `${basePath}/${encodedObjectKey}`;
    return resolvedUrl.toString();
  } catch {
    return undefined;
  }
}

export function resolveOracleImageUrl(
  image: Pick<OracleImageAsset, "objectKey">,
  publicBaseUrl?: string,
): string | undefined {
  return resolveOracleObjectUrl(
    image.objectKey,
    publicBaseUrl ?? process.env.NEXT_PUBLIC_ORACLE_OBJECT_BASE_URL,
  );
}
