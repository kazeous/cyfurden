"use client";

import type { ReactNode } from "react";
import { FaceboothCanvasBoundary } from "@/components/facebooth/facebooth-canvas-boundary";
import {
  FaceboothSceneStage,
  type SceneCameraPreset,
} from "@/components/facebooth/scene-model";
import type { FaceboothSceneDocument } from "@/lib/facebooth-documents";
import styles from "./public-facebooth-viewer.module.css";

export function PublicFaceboothWebgl({
  artworkUrls,
  canvasLabel,
  cameraPreset,
  document,
  fallback,
}: {
  artworkUrls: Record<string, string | null>;
  canvasLabel: string;
  cameraPreset: SceneCameraPreset;
  document: FaceboothSceneDocument;
  fallback: ReactNode;
}) {
  return (
    <FaceboothCanvasBoundary
      canvasLabel={canvasLabel}
      className={styles.canvas}
      fallback={fallback}
    >
      <FaceboothSceneStage
        artworkUrls={artworkUrls}
        cameraPreset={cameraPreset}
        document={document}
        onSelect={() => undefined}
        selected={{ kind: "TABLE", id: "table" }}
        showSelection={false}
      />
    </FaceboothCanvasBoundary>
  );
}
