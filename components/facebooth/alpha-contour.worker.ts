/// <reference lib="webworker" />

import {
  createPresetFaceboothContour,
  traceFaceboothAlphaContour,
} from "@/lib/facebooth-contour";

type TraceRequest = {
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  fillGaps: boolean;
};

self.onmessage = async (event: MessageEvent<TraceRequest>) => {
  try {
    const blob = new Blob([event.data.bytes], { type: event.data.contentType });
    const bitmap = await createImageBitmap(blob);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (
      sourceWidth < 1 ||
      sourceHeight < 1 ||
      sourceWidth > 16_384 ||
      sourceHeight > 16_384
    ) {
      bitmap.close();
      throw new Error(
        "Artwork dimensions must be between 1 and 16,384 pixels.",
      );
    }
    if (event.data.contentType === "image/jpeg") {
      bitmap.close();
      self.postMessage({
        kind: "complete",
        pixelWidth: sourceWidth,
        pixelHeight: sourceHeight,
        points: createPresetFaceboothContour(),
        opaqueFallback: true,
      });
      return;
    }

    const scale = Math.min(1, 768 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Artwork pixels could not be read.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const rgba = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (
      let source = 3, target = 0;
      source < rgba.length;
      source += 4, target += 1
    ) {
      alpha[target] = rgba[source];
    }
    const result = traceFaceboothAlphaContour({
      alpha,
      width,
      height,
      fillGaps: event.data.fillGaps,
    });
    self.postMessage({
      kind: "complete",
      pixelWidth: sourceWidth,
      pixelHeight: sourceHeight,
      points: result.points,
      opaqueFallback: result.opaqueFallback,
    });
  } catch (error) {
    self.postMessage({
      kind: "error",
      message:
        error instanceof Error ? error.message : "Artwork tracing failed.",
    });
  }
};

export {};
