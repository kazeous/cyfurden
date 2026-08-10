"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  Color,
  PerspectiveCamera,
  RGBAFormat,
  UnsignedByteType,
  WebGLRenderTarget,
} from "three";

export type FaceboothPngBackground = "STUDIO" | "TRANSPARENT";
export type FaceboothPngCapture = (input: {
  width: number;
  height: number;
  background: FaceboothPngBackground;
}) => Promise<Blob>;

export function resolveFaceboothPngSize(
  preset: "SQUARE" | "CURRENT",
  aspect: number,
) {
  if (preset === "SQUARE") return { width: 2_048, height: 2_048 };
  const safeAspect = Math.max(0.1, Math.min(10, aspect));
  return safeAspect >= 1
    ? { width: 2_048, height: Math.max(1, Math.round(2_048 / safeAspect)) }
    : { width: Math.max(1, Math.round(2_048 * safeAspect)), height: 2_048 };
}

function pixelsToPng(pixels: Uint8Array, width: number, height: number) {
  const flipped = new Uint8ClampedArray(pixels.length);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    flipped.set(
      pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
      (height - row - 1) * rowBytes,
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG canvas is unavailable.");
  context.putImageData(new ImageData(flipped, width, height), 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG export failed.")),
      "image/png",
    );
  });
}

export function FaceboothPngCaptureBridge({
  onReady,
}: {
  onReady: (capture: FaceboothPngCapture | null) => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    const capture: FaceboothPngCapture = async ({
      width,
      height,
      background,
    }) => {
      const target = new WebGLRenderTarget(width, height, {
        format: RGBAFormat,
        type: UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      const previousTarget = gl.getRenderTarget();
      const previousBackground = scene.background;
      const perspective = camera instanceof PerspectiveCamera ? camera : null;
      const previousAspect = perspective?.aspect;
      try {
        if (perspective) {
          perspective.aspect = width / height;
          perspective.updateProjectionMatrix();
        }
        scene.background =
          background === "TRANSPARENT" ? null : new Color("#e8e5dd");
        gl.setRenderTarget(target);
        gl.render(scene, camera);
        const pixels = new Uint8Array(width * height * 4);
        try {
          await gl.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            width,
            height,
            pixels,
          );
        } catch {
          // Some WebGL2 drivers expose the async method but fail inside its
          // pixel-buffer polling path. Keep export available on those clients.
          gl.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        }
        return await pixelsToPng(pixels, width, height);
      } finally {
        gl.setRenderTarget(previousTarget);
        scene.background = previousBackground;
        if (perspective && previousAspect !== undefined) {
          perspective.aspect = previousAspect;
          perspective.updateProjectionMatrix();
        }
        target.dispose();
        invalidate();
      }
    };
    onReady(capture);
    return () => onReady(null);
  }, [camera, gl, invalidate, onReady, scene]);
  return null;
}
