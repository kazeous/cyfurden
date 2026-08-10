"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Preload } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import styles from "./facebooth-canvas.module.css";

export type FaceboothCanvasRuntimeProps = {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  onContextLost?: () => void;
  onContextRestored?: () => void;
};

function ContextLifecycle({
  onLost,
  onRestored,
}: {
  onLost?: () => void;
  onRestored?: () => void;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      onLost?.();
    };
    const handleRestored = () => {
      onRestored?.();
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", handleLost);
    canvas.addEventListener("webglcontextrestored", handleRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
      gl.renderLists.dispose();
    };
  }, [gl, invalidate, onLost, onRestored]);
  return null;
}

export function FaceboothCanvasRuntime({
  children,
  className,
  fallback = null,
  onContextLost,
  onContextRestored,
}: FaceboothCanvasRuntimeProps) {
  const [contextLost, setContextLost] = useState(false);
  return (
    <div className={`${styles.runtime} ${className ?? ""}`}>
      <Canvas
        camera={{ position: [0.28, 0.2, 0.34], fov: 36, near: 0.001, far: 100 }}
        dpr={[1, 1.75]}
        fallback={fallback}
        frameloop="demand"
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        data-context-lost={contextLost || undefined}
      >
        <Suspense fallback={null}>
          <ContextLifecycle
            onLost={() => {
              setContextLost(true);
              onContextLost?.();
            }}
            onRestored={() => {
              setContextLost(false);
              onContextRestored?.();
            }}
          />
          {children}
          <Preload all />
        </Suspense>
      </Canvas>
      {contextLost ? <div className={styles.fallback}>{fallback}</div> : null}
    </div>
  );
}
