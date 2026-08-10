"use client";

import type { FaceboothContourPoint } from "@/lib/facebooth-contour";

export type TracedFaceboothArtwork = {
  pixelWidth: number;
  pixelHeight: number;
  points: FaceboothContourPoint[];
  opaqueFallback: boolean;
};

export async function traceFaceboothArtwork(file: File, fillGaps: boolean) {
  const bytes = await file.arrayBuffer();
  return new Promise<TracedFaceboothArtwork>((resolve, reject) => {
    const worker = new Worker(
      new URL("./alpha-contour.worker.ts", import.meta.url),
      { type: "module" },
    );
    const finish = () => worker.terminate();
    worker.onerror = () => {
      finish();
      reject(new Error("The artwork worker stopped before tracing finished."));
    };
    worker.onmessage = (
      event: MessageEvent<
        | ({ kind: "complete" } & TracedFaceboothArtwork)
        | { kind: "error"; message: string }
      >,
    ) => {
      finish();
      if (event.data.kind === "error") reject(new Error(event.data.message));
      else resolve(event.data);
    };
    worker.postMessage({ bytes, contentType: file.type, fillGaps }, [bytes]);
  });
}
