import { db } from "@/lib/db";
import { parseFaceboothPublicationDocument } from "@/lib/facebooth-documents";
import { readStorefrontDocument } from "@/lib/storefront-document";
import { assertBoothServiceAccess } from "@/lib/platform-targets";

export async function readPublishedFaceboothBySlug(slug: string) {
  const booth = await db.booth.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      serviceState: true,
      storefront: { select: { publishedDocument: true } },
      faceboothPublication: {
        select: { revision: true, document: true },
      },
    },
  });
  if (
    !booth ||
    booth.status !== "PUBLISHED" ||
    !booth.storefront?.publishedDocument ||
    !booth.faceboothPublication
  ) {
    return null;
  }
  try {
    assertBoothServiceAccess(booth.serviceState, "PUBLIC_READ");
  } catch {
    return null;
  }
  const publication = parseFaceboothPublicationDocument(
    booth.faceboothPublication.document,
  );
  if (!publication) return null;
  const storefront = readStorefrontDocument(
    booth.storefront.publishedDocument,
    booth.name,
  );
  return {
    booth,
    locale: storefront.locale,
    publication,
    revision: booth.faceboothPublication.revision,
  };
}
