import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PublicFaceboothViewer } from "@/components/facebooth/public-facebooth-viewer";
import { readPublishedFaceboothBySlug } from "@/lib/facebooth-public";
import { parseBilingual } from "@/lib/i18n";
import { getPublicFaceboothStrings } from "@/lib/i18n/facebooth-public";
import { resolveOracleObjectUrl } from "@/lib/oracle-images";

const getPublicFacebooth = cache(async (slug: string) => {
  try {
    return await readPublishedFaceboothBySlug(slug);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { "cyfurden.operation": "public_facebooth.load" },
    });
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const published = await getPublicFacebooth(slug);
  if (!published) {
    return {
      title: "Facebooth not found",
      robots: { index: false, follow: false },
    };
  }
  const strings = getPublicFaceboothStrings(published.locale);
  const sceneName = parseBilingual(
    published.publication.scene.name,
    published.locale,
  );
  return {
    title: `${sceneName} · ${strings.metadataTitle}`,
    description: strings.cardDescription(published.publication.merch.length),
    openGraph: {
      title: `${sceneName} · ${strings.metadataTitle}`,
      description: strings.cardDescription(published.publication.merch.length),
    },
  };
}

export default async function PublicFaceboothPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const published = await getPublicFacebooth(slug);
  if (!published) notFound();

  const { publication, locale } = published;
  const scene = publication.scene.document;
  const artworkUrls = Object.fromEntries(
    scene.merchSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.document.artwork.objectKey
        ? (resolveOracleObjectUrl(snapshot.document.artwork.objectKey) ?? null)
        : null,
    ]),
  );
  const previewUrl = publication.previewObjectKey
    ? (resolveOracleObjectUrl(publication.previewObjectKey) ?? null)
    : null;

  return (
    <PublicFaceboothViewer
      artworkUrls={artworkUrls}
      boothSlug={published.booth.slug}
      locale={locale}
      merch={publication.merch.map((item) => ({
        projectId: item.projectId,
        name: parseBilingual(item.name, locale),
        artworkUrl: item.document.artwork.objectKey
          ? (resolveOracleObjectUrl(item.document.artwork.objectKey) ?? null)
          : null,
        document: item.document,
      }))}
      previewUrl={previewUrl}
      revision={published.revision}
      scene={scene}
      sceneName={parseBilingual(publication.scene.name, locale)}
    />
  );
}
