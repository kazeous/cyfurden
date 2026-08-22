import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  SceneEditor,
  type SceneMerchProject,
} from "@/components/facebooth/scene-editor";
import { StandeeEditor } from "@/components/facebooth/standee-editor";
import { requireBoothRole } from "@/lib/authorization";
import {
  listFaceboothProjectsForManager,
  readFaceboothProjectForManager,
} from "@/lib/facebooth-projects";
import { getFaceboothStrings } from "@/lib/i18n/facebooth";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { resolveOracleObjectUrl } from "@/lib/oracle-images";
import { isOracleQrUploadConfigured } from "@/lib/oracle-uploads";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getFaceboothStrings(await readLocaleCookie()).metadataTitle,
    robots: { index: false, follow: false },
  };
}

export default async function FaceboothProjectPage({
  params,
}: {
  params: Promise<{ boothId: string; projectId: string }>;
}) {
  const { boothId, projectId } = await params;
  const [{ session }, locale] = await Promise.all([
    requireBoothRole(boothId, ["OWNER", "ADMIN"]),
    readLocaleCookie(),
  ]);
  const result = await readFaceboothProjectForManager({
    boothId,
    projectId,
    actorUserId: session.user.id,
  });
  if (result.kind !== "found") notFound();
  if (result.project.document.kind === "MERCH") {
    const artworkUrl = result.project.document.artwork.objectKey
      ? (resolveOracleObjectUrl(result.project.document.artwork.objectKey) ??
        null)
      : null;
    return (
      <StandeeEditor
        boothId={boothId}
        initialArtworkUrl={artworkUrl}
        initialProject={{
          id: result.project.id,
          name: result.project.name,
          editVersion: result.project.editVersion,
          previewObjectKey: result.project.previewObjectKey,
          document: result.project.document,
        }}
        locale={locale}
        previewUploadsEnabled={isOracleQrUploadConfigured()}
      />
    );
  }

  const projectList = await listFaceboothProjectsForManager({
    boothId,
    actorUserId: session.user.id,
    kind: "MERCH",
  });
  const merchResults =
    projectList.kind === "found"
      ? await Promise.all(
          projectList.projects.map(({ id }) =>
            readFaceboothProjectForManager({
              boothId,
              projectId: id,
              actorUserId: session.user.id,
            }),
          ),
        )
      : [];
  const merchLibrary = merchResults.flatMap((merch): SceneMerchProject[] => {
    if (merch.kind !== "found" || merch.project.document.kind !== "MERCH") {
      return [];
    }
    return [
      {
        id: merch.project.id,
        name: merch.project.name,
        editVersion: merch.project.editVersion,
        document: merch.project.document,
        artworkUrl: merch.project.document.artwork.objectKey
          ? (resolveOracleObjectUrl(merch.project.document.artwork.objectKey) ??
            null)
          : null,
      },
    ];
  });
  const initialSnapshotArtworkUrls = Object.fromEntries(
    result.project.document.merchSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.document.artwork.objectKey
        ? (resolveOracleObjectUrl(snapshot.document.artwork.objectKey) ?? null)
        : null,
    ]),
  );
  return (
    <SceneEditor
      boothId={boothId}
      initialProject={{
        id: result.project.id,
        name: result.project.name,
        editVersion: result.project.editVersion,
        previewObjectKey: result.project.previewObjectKey,
        document: result.project.document,
      }}
      initialSnapshotArtworkUrls={initialSnapshotArtworkUrls}
      locale={locale}
      merchLibrary={merchLibrary}
      previewUploadsEnabled={isOracleQrUploadConfigured()}
    />
  );
}
