"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { FaceboothCanvasRuntimeProps } from "@/components/facebooth/facebooth-canvas-runtime";
import { supportsFaceboothWebGl2 } from "@/lib/facebooth-rendering";

const ClientOnlyFaceboothCanvas = dynamic(
  () =>
    import("@/components/facebooth/facebooth-canvas-runtime").then(
      ({ FaceboothCanvasRuntime }) => FaceboothCanvasRuntime,
    ),
  { ssr: false },
);

export function FaceboothCanvasBoundary(props: FaceboothCanvasRuntimeProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setAvailable(supportsFaceboothWebGl2());
    });
    return () => {
      active = false;
    };
  }, []);
  if (available === null) return props.fallback ?? null;
  if (!available) return props.fallback ?? null;
  return <ClientOnlyFaceboothCanvas {...props} />;
}
