import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StandeeEditor } from "@/components/facebooth/standee-editor";
import { requireBoothRole } from "@/lib/authorization";
import { readFaceboothProjectForManager } from "@/lib/facebooth-projects";
import { getFaceboothStrings } from "@/lib/i18n/facebooth";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { resolveOracleObjectUrl } from "@/lib/oracle-images";

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
  if (result.kind !== "found" || result.project.document.kind !== "MERCH")
    notFound();
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
        document: result.project.document,
      }}
      locale={locale}
      strings={getFaceboothStrings(locale)}
    />
  );
}
