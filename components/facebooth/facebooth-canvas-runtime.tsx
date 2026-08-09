"use client";

import { Suspense, type ReactNode } from "react";
import { Preload } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

export type FaceboothCanvasRuntimeProps = {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
};

/**
 * The Phase 15 renderer mounts through this browser-only runtime. Geometry,
 * cameras, controls, and editor behavior intentionally belong to Phase 15B.
 */
export function FaceboothCanvasRuntime({
  children,
  className,
  fallback = null,
}: FaceboothCanvasRuntimeProps) {
  return (
    <Canvas
      className={className}
      dpr={[1, 2]}
      fallback={fallback}
      frameloop="demand"
    >
      <Suspense fallback={null}>
        {children}
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
