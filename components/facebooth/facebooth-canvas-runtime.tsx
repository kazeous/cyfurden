"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Preload } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { getConsoleFunction, setConsoleFunction } from "three";
import styles from "./facebooth-canvas.module.css";

const threeRuntime = globalThis as typeof globalThis & {
  __cyfurdenFaceboothConsoleConfigured?: boolean;
};

if (!threeRuntime.__cyfurdenFaceboothConsoleConfigured) {
  const inheritedConsoleFunction = getConsoleFunction();
  setConsoleFunction((level, message, ...params) => {
    if (
      level === "warn" &&
      message ===
        "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead."
    ) {
      return;
    }
    if (inheritedConsoleFunction) {
      inheritedConsoleFunction(level, message, ...params);
      return;
    }
    if (level === "error") console.error(message, ...params);
    else if (level === "warn") console.warn(message, ...params);
    else console.log(message, ...params);
  });
  threeRuntime.__cyfurdenFaceboothConsoleConfigured = true;
}

export type FaceboothCanvasRuntimeProps = {
  canvasLabel: string;
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  onContextLost?: () => void;
  onContextRestored?: () => void;
};

function ContextLifecycle({
  canvasLabel,
  onLost,
  onReady,
  onRestored,
}: {
  canvasLabel: string;
  onLost?: () => void;
  onReady?: () => void;
  onRestored?: () => void;
}) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute("aria-label", canvasLabel);
    canvas.setAttribute("role", "img");
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
    onReady?.();
    return () => {
      canvas.removeEventListener("webglcontextlost", handleLost);
      canvas.removeEventListener("webglcontextrestored", handleRestored);
      gl.renderLists.dispose();
    };
  }, [canvasLabel, gl, invalidate, onLost, onReady, onRestored]);
  return null;
}

export function FaceboothCanvasRuntime({
  canvasLabel,
  children,
  className,
  fallback = null,
  onContextLost,
  onContextRestored,
}: FaceboothCanvasRuntimeProps) {
  const [contextLost, setContextLost] = useState(false);
  const [ready, setReady] = useState(false);
  return (
    <div className={`${styles.runtime} ${className ?? ""}`}>
      <Canvas
        camera={{ position: [0.28, 0.2, 0.34], fov: 36, near: 0.001, far: 100 }}
        dpr={[1, 1.75]}
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
            canvasLabel={canvasLabel}
            onLost={() => {
              setContextLost(true);
              onContextLost?.();
            }}
            onRestored={() => {
              setContextLost(false);
              onContextRestored?.();
            }}
            onReady={() => setReady(true)}
          />
          {children}
          <Preload all />
        </Suspense>
      </Canvas>
      {!ready || contextLost ? (
        <div className={styles.fallback}>{fallback}</div>
      ) : null}
    </div>
  );
}
