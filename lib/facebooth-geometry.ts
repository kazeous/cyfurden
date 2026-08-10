import {
  acrylicStandeeDocumentSchema,
  type AcrylicStandeeDocument,
} from "@/lib/facebooth-documents";
import { createPresetFaceboothContour } from "@/lib/facebooth-contour";

export type StandeeGeometryModel = {
  widthMm: number;
  heightMm: number;
  thicknessMm: 2 | 3 | 5;
  borderMm: number;
  outlineMm: Array<{ x: number; y: number }>;
  base: {
    enabled: boolean;
    widthMm: number;
    depthMm: number;
    thicknessMm: number;
  };
};

const clampStandeeDimension = (value: number) =>
  Math.max(20, Math.min(2_000, Math.round(value)));

export function getStandeeArtworkAspect(document: AcrylicStandeeDocument) {
  const { pixelWidth, pixelHeight } = document.artwork;
  return pixelWidth && pixelHeight
    ? pixelWidth / pixelHeight
    : document.sizeMm.width / document.sizeMm.height;
}

export function resizeStandeePreservingAspect(
  document: AcrylicStandeeDocument,
  axis: "width" | "height",
  nextValueMm: number,
): AcrylicStandeeDocument {
  const aspect = getStandeeArtworkAspect(document);
  const sizeMm =
    axis === "width"
      ? {
          width: clampStandeeDimension(nextValueMm),
          height: clampStandeeDimension(nextValueMm / aspect),
        }
      : {
          width: clampStandeeDimension(nextValueMm * aspect),
          height: clampStandeeDimension(nextValueMm),
        };
  return acrylicStandeeDocumentSchema.parse({
    ...document,
    sizeMm: { ...document.sizeMm, ...sizeMm },
    base: {
      ...document.base,
      widthMm: Math.min(document.base.widthMm, sizeMm.width),
    },
  });
}

export function buildStandeeGeometryModel(
  value: AcrylicStandeeDocument,
): StandeeGeometryModel {
  const document = acrylicStandeeDocumentSchema.parse(value);
  const contour =
    document.artwork.contourPoints ?? createPresetFaceboothContour();
  return {
    widthMm: document.sizeMm.width,
    heightMm: document.sizeMm.height,
    thicknessMm: document.sizeMm.thickness,
    borderMm: document.print.borderMm,
    outlineMm: contour.map((point) => ({
      x: (point.xMillionths / 1_000_000 - 0.5) * document.sizeMm.width,
      y: (point.yMillionths / 1_000_000) * document.sizeMm.height,
    })),
    base: { ...document.base },
  };
}
