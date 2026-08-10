import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FaceboothLibrary,
  type FaceboothLibraryProject,
} from "@/components/facebooth/facebooth-library";
import { requireBoothRole } from "@/lib/authorization";
import { collectFaceboothArtworkObjectKeys } from "@/lib/facebooth-documents";
import {
  listFaceboothProjectsForManager,
  readFaceboothProjectForManager,
} from "@/lib/facebooth-projects";
import { getFaceboothStrings } from "@/lib/i18n/facebooth";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { resolveOracleObjectUrl } from "@/lib/oracle-images";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getFaceboothStrings(await readLocaleCookie()).libraryMetadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function FaceboothLibraryPage({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  const [{ session }, locale] = await Promise.all([
    requireBoothRole(boothId, ["OWNER", "ADMIN"]),
    readLocaleCookie(),
  ]);
  const list = await listFaceboothProjectsForManager({
    boothId,
    actorUserId: session.user.id,
  });
  if (list.kind !== "found") notFound();
  const results = await Promise.all(
    list.projects.map(({ id }) =>
      readFaceboothProjectForManager({
        boothId,
        projectId: id,
        actorUserId: session.user.id,
      }),
    ),
  );
  const projects = results.flatMap((result): FaceboothLibraryProject[] => {
    if (result.kind !== "found") return [];
    const assetUrls = Object.fromEntries(
      [...collectFaceboothArtworkObjectKeys(result.project.document)].flatMap(
        (objectKey) => {
          const url = resolveOracleObjectUrl(objectKey);
          return url ? [[objectKey, url]] : [];
        },
      ),
    );
    return [
      {
        id: result.project.id,
        kind: result.project.kind,
        editVersion: result.project.editVersion,
        name: result.project.name,
        document: result.project.document,
        previewUrl: result.project.previewObjectKey
          ? (resolveOracleObjectUrl(result.project.previewObjectKey) ?? null)
          : null,
        assetUrls,
        updatedAt: result.project.updatedAt,
      },
    ];
  });
  return (
    <FaceboothLibrary
      boothId={boothId}
      locale={locale}
      projects={projects}
      strings={getFaceboothStrings(locale)}
    />
  );
}
