"use client";

import dynamic from "next/dynamic";
import type { FaceboothCanvasRuntimeProps } from "@/components/facebooth/facebooth-canvas-runtime";

const ClientOnlyFaceboothCanvas = dynamic(
  () =>
    import("@/components/facebooth/facebooth-canvas-runtime").then(
      ({ FaceboothCanvasRuntime }) => FaceboothCanvasRuntime,
    ),
  { ssr: false },
);

export function FaceboothCanvasBoundary(props: FaceboothCanvasRuntimeProps) {
  return <ClientOnlyFaceboothCanvas {...props} />;
}
