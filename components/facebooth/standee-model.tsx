"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  DoubleSide,
  ExtrudeGeometry,
  FrontSide,
  Group,
  LinearFilter,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Texture,
} from "three";
import type { AcrylicStandeeDocument } from "@/lib/facebooth-documents";
import { buildStandeeGeometryModel } from "@/lib/facebooth-geometry";
import {
  faceboothCameraPresets,
  type FaceboothBackgroundMode,
  type FaceboothCameraPreset,
} from "@/lib/facebooth-rendering";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function CameraRig({ preset }: { preset: FaceboothCameraPreset }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const config = faceboothCameraPresets[preset];
    camera.position.set(
      config.position[0],
      config.position[1],
      config.position[2],
    );
    camera.lookAt(config.target[0], config.target[1], config.target[2]);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, preset]);
  return null;
}

function useArtworkTexture(url: string | null) {
  const [loadedTexture, setLoadedTexture] = useState<{
    url: string;
    texture: Texture;
  } | null>(null);
  const { invalidate } = useThree();
  useEffect(() => {
    if (!url) return;
    let active = true;
    let currentTexture: Texture | null = null;
    let currentBitmap: ImageBitmap | null = null;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const blob = await response.blob();
        const source = await createImageBitmap(blob);
        const scale = Math.min(
          1,
          2_048 / Math.max(source.width, source.height),
        );
        const bitmap =
          scale < 1
            ? await createImageBitmap(blob, {
                imageOrientation: "flipY",
                resizeHeight: Math.max(1, Math.round(source.height * scale)),
                resizeQuality: "high",
                resizeWidth: Math.max(1, Math.round(source.width * scale)),
              })
            : await createImageBitmap(blob, { imageOrientation: "flipY" });
        source.close();
        if (!active) {
          bitmap.close();
          return;
        }
        currentBitmap = bitmap;
        const texture = new Texture(bitmap);
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        currentTexture = texture;
        setLoadedTexture({ url, texture });
        invalidate();
      } catch {
        // The acrylic geometry remains usable when the public artwork GET fails.
      }
    })();
    return () => {
      active = false;
      controller.abort();
      currentTexture?.dispose();
      currentBitmap?.close();
    };
  }, [invalidate, url]);
  return loadedTexture?.url === url ? loadedTexture.texture : null;
}

function StandeeObject({
  document,
  artworkUrl,
  turntable,
}: {
  document: AcrylicStandeeDocument;
  artworkUrl: string | null;
  turntable: boolean;
}) {
  const group = useRef<Group>(null);
  const reducedMotion = useReducedMotion();
  const model = useMemo(() => buildStandeeGeometryModel(document), [document]);
  const shape = useMemo(() => {
    const value = new Shape();
    const [first, ...rest] = model.outlineMm;
    value.moveTo(first.x / 1_000, first.y / 1_000);
    rest.forEach((point) => value.lineTo(point.x / 1_000, point.y / 1_000));
    value.closePath();
    return value;
  }, [model.outlineMm]);
  const acrylicGeometry = useMemo(() => {
    const geometry = new ExtrudeGeometry(shape, {
      depth: model.thicknessMm / 1_000,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: Math.min(0.0015, model.thicknessMm / 4_000),
      bevelThickness: Math.min(0.001, model.thicknessMm / 5_000),
      curveSegments: 4,
    });
    geometry.center();
    geometry.translate(
      0,
      model.heightMm / 2_000 +
        (model.base.enabled ? model.base.thicknessMm / 1_000 : 0),
      0,
    );
    return geometry;
  }, [
    model.base.enabled,
    model.base.thicknessMm,
    model.heightMm,
    model.thicknessMm,
    shape,
  ]);
  const artGeometry = useMemo(() => {
    const geometry = new ShapeGeometry(shape, 4);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const uv = geometry.getAttribute("uv");
    if (box) {
      const width = Math.max(box.max.x - box.min.x, Number.EPSILON);
      const height = Math.max(box.max.y - box.min.y, Number.EPSILON);
      for (let index = 0; index < uv.count; index += 1) {
        uv.setXY(
          index,
          (geometry.getAttribute("position").getX(index) - box.min.x) / width,
          (geometry.getAttribute("position").getY(index) - box.min.y) / height,
        );
      }
      uv.needsUpdate = true;
    }
    geometry.translate(
      0,
      model.base.enabled ? model.base.thicknessMm / 1_000 : 0,
      model.thicknessMm / 2_000 + 0.0006,
    );
    return geometry;
  }, [model.base.enabled, model.base.thicknessMm, model.thicknessMm, shape]);
  useEffect(
    () => () => {
      acrylicGeometry.dispose();
      artGeometry.dispose();
    },
    [acrylicGeometry, artGeometry],
  );
  const texture = useArtworkTexture(artworkUrl);
  useFrame((_, delta) => {
    if (group.current && turntable && !reducedMotion) {
      group.current.rotation.y += delta * 0.45;
      _.invalidate();
    }
  });
  const tint =
    document.material.finish === "TINTED" && document.material.tintHex
      ? document.material.tintHex
      : "#d9f2ed";
  const opacity = document.material.finish === "FROSTED" ? 0.7 : 0.42;
  const artScaleX = Math.max(
    0.1,
    (model.widthMm - model.borderMm * 2) / model.widthMm,
  );
  const artScaleY = Math.max(
    0.1,
    (model.heightMm - model.borderMm * 2) / model.heightMm,
  );
  return (
    <group ref={group}>
      <mesh geometry={acrylicGeometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={new Color(tint)}
          metalness={document.material.finish === "IRIDESCENT" ? 0.18 : 0}
          opacity={opacity}
          roughness={document.material.finish === "FROSTED" ? 0.48 : 0.12}
          side={DoubleSide}
          thickness={0.02}
          transparent
          transmission={document.material.finish === "FROSTED" ? 0.25 : 0.55}
        />
      </mesh>
      {texture ? (
        <group scale={[artScaleX, artScaleY, 1]}>
          <mesh geometry={artGeometry}>
            <meshBasicMaterial
              alphaTest={0.02}
              map={texture}
              side={FrontSide}
              toneMapped={false}
              transparent
            />
          </mesh>
          {document.print.sides === "TWO_SIDED" ? (
            <mesh
              geometry={artGeometry}
              rotation={[0, Math.PI, 0]}
              position={[0, 0, -model.thicknessMm / 1_000 - 0.0012]}
            >
              <meshBasicMaterial
                alphaTest={0.02}
                map={texture}
                side={FrontSide}
                toneMapped={false}
                transparent
              />
            </mesh>
          ) : null}
        </group>
      ) : null}
      {model.base.enabled ? (
        <mesh
          castShadow
          receiveShadow
          position={[0, model.base.thicknessMm / 2_000, 0]}
        >
          <boxGeometry
            args={[
              model.base.widthMm / 1_000,
              model.base.thicknessMm / 1_000,
              model.base.depthMm / 1_000,
            ]}
          />
          <meshPhysicalMaterial
            color="#e4f4f0"
            opacity={0.55}
            roughness={0.16}
            transparent
            transmission={0.45}
          />
        </mesh>
      ) : null}
    </group>
  );
}

export function FaceboothStandeeStage({
  document,
  artworkUrl,
  background,
  cameraPreset,
  turntable,
}: {
  document: AcrylicStandeeDocument;
  artworkUrl: string | null;
  background: FaceboothBackgroundMode;
  cameraPreset: FaceboothCameraPreset;
  turntable: boolean;
}) {
  const backgroundColor =
    background === "SOLID"
      ? "#eef0ec"
      : background === "GRADIENT"
        ? "#e8eef3"
        : background === "STUDIO"
          ? "#f4f0e7"
          : null;
  return (
    <>
      {backgroundColor ? (
        <color attach="background" args={[backgroundColor]} />
      ) : null}
      <ambientLight intensity={1.5} />
      <directionalLight
        castShadow
        intensity={2.4}
        position={[0.4, 0.6, 0.45]}
      />
      <directionalLight intensity={0.7} position={[-0.4, 0.2, -0.2]} />
      {background !== "TRANSPARENT" ? (
        <mesh
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.001, 0]}
        >
          <planeGeometry args={[2, 2]} />
          <meshStandardMaterial
            color={background === "GRADIENT" ? "#d7e0e7" : "#eee9df"}
            roughness={0.95}
          />
        </mesh>
      ) : null}
      <StandeeObject
        artworkUrl={artworkUrl}
        document={document}
        turntable={turntable}
      />
      <CameraRig preset={cameraPreset} />
      <OrbitControls
        enableDamping={false}
        enablePan={false}
        maxDistance={1.5}
        minDistance={0.16}
        target={[0, document.sizeMm.height / 2_000, 0]}
      />
    </>
  );
}
