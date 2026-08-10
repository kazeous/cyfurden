"use client";

import { Grid, OrbitControls, RoundedBox } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { StandeeObject } from "@/components/facebooth/standee-model";
import type { FaceboothSceneDocument } from "@/lib/facebooth-documents";
import type { SceneSelection } from "@/lib/facebooth-scene";

export type SceneCameraPreset = "FRONT" | "THREE_QUARTER" | "TOP";

const renderColors = {
  backdropBlack: "#243044",
  backdropWhite: "#f0eee8",
  clear: "#dceeea",
  floor: "#e8e5dd",
  grid: "#9aa4b2",
  ink: "#263750",
  selection: "#c83f4f",
  tableBlack: "#2b3442",
  tableWhite: "#ebe9e2",
  woodDark: "#5f493a",
  woodLight: "#aa815e",
} as const;

function finishColor(finish: string) {
  if (finish === "BLACK") return renderColors.tableBlack;
  if (finish === "WHITE") return renderColors.tableWhite;
  if (finish === "WOOD_DARK") return renderColors.woodDark;
  if (finish === "CLEAR") return renderColors.clear;
  return renderColors.woodLight;
}

function SceneCameraRig({
  document,
  preset,
}: {
  document: FaceboothSceneDocument;
  preset: SceneCameraPreset;
}) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const width = document.footprintMm.width / 1_000;
    const depth = document.footprintMm.depth / 1_000;
    const height = document.footprintMm.height / 1_000;
    const span = Math.max(width, depth, height);
    const position =
      preset === "TOP"
        ? ([0, span * 1.35, 0.01] as const)
        : preset === "FRONT"
          ? ([0, height * 0.55, span * 1.25] as const)
          : ([span * 0.82, height * 0.72, span * 0.92] as const);
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(0, Math.min(height * 0.35, 0.9), 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, document.footprintMm, invalidate, preset]);
  return null;
}

function SceneTable({
  document,
  selected,
  onSelect,
}: {
  document: FaceboothSceneDocument;
  selected: boolean;
  onSelect: () => void;
}) {
  const table = document.table;
  const width = table.sizeMm.width / 1_000;
  const depth = table.sizeMm.depth / 1_000;
  const height = table.sizeMm.height / 1_000;
  const top = table.topThicknessMm / 1_000;
  const color = selected ? renderColors.selection : finishColor(table.finish);
  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect();
  };
  const legHeight = Math.max(0.05, height - top);
  return (
    <group
      onClick={select}
      position={[
        table.transform.positionMm.x / 1_000,
        table.transform.positionMm.y / 1_000,
        table.transform.positionMm.z / 1_000,
      ]}
      rotation={[
        0,
        (table.transform.rotationMilliDegrees.y / 180_000) * Math.PI,
        0,
      ]}
    >
      {table.edge === "SQUARE" ? (
        <mesh castShadow receiveShadow position={[0, height - top / 2, 0]}>
          <boxGeometry args={[width, top, depth]} />
          <meshStandardMaterial color={color} roughness={0.62} />
        </mesh>
      ) : (
        <RoundedBox
          args={[width, top, depth]}
          castShadow
          position={[0, height - top / 2, 0]}
          radius={table.edge === "ROUNDED" ? Math.min(0.035, top / 2) : 0.006}
          receiveShadow
          smoothness={table.edge === "ROUNDED" ? 3 : 1}
        >
          <meshStandardMaterial color={color} roughness={0.62} />
        </RoundedBox>
      )}
      {table.legStyle === "PEDESTAL" ? (
        <mesh castShadow position={[0, legHeight / 2, 0]}>
          <boxGeometry
            args={[
              Math.min(width * 0.3, 0.46),
              legHeight,
              Math.min(depth * 0.55, 0.4),
            ]}
          />
          <meshStandardMaterial color={color} roughness={0.68} />
        </mesh>
      ) : table.legStyle === "TRESTLE" ? (
        [-1, 1].map((side) => (
          <mesh
            castShadow
            key={side}
            position={[side * width * 0.32, legHeight / 2, 0]}
          >
            <boxGeometry args={[0.08, legHeight, depth * 0.82]} />
            <meshStandardMaterial color={color} roughness={0.68} />
          </mesh>
        ))
      ) : (
        [-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <mesh
              castShadow
              key={`${x}:${z}`}
              position={[
                x * (width / 2 - 0.06),
                legHeight / 2,
                z * (depth / 2 - 0.06),
              ]}
            >
              <boxGeometry args={[0.07, legHeight, 0.07]} />
              <meshStandardMaterial color={color} roughness={0.68} />
            </mesh>
          )),
        )
      )}
    </group>
  );
}

export function FaceboothSceneStage({
  document,
  selected,
  cameraPreset,
  artworkUrls,
  onSelect,
  showSelection = true,
}: {
  document: FaceboothSceneDocument;
  selected: SceneSelection;
  cameraPreset: SceneCameraPreset;
  artworkUrls: Record<string, string | null>;
  onSelect: (selection: SceneSelection) => void;
  showSelection?: boolean;
}) {
  const snapshotById = new Map(
    document.merchSnapshots.map((snapshot) => [snapshot.id, snapshot]),
  );
  const footprintWidth = document.footprintMm.width / 1_000;
  const footprintDepth = document.footprintMm.depth / 1_000;
  const select =
    (selection: SceneSelection) => (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onSelect(selection);
    };
  return (
    <>
      <color attach="background" args={[renderColors.floor]} />
      <ambientLight intensity={1.7} />
      <directionalLight castShadow intensity={2.2} position={[4, 6, 4]} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[footprintWidth, footprintDepth]} />
        <meshStandardMaterial color={renderColors.floor} roughness={0.96} />
      </mesh>
      <Grid
        args={[footprintWidth, footprintDepth]}
        cellColor={renderColors.grid}
        cellSize={0.1}
        cellThickness={0.6}
        fadeDistance={Math.max(footprintWidth, footprintDepth) * 1.2}
        infiniteGrid={false}
        position={[0, 0.002, 0]}
        sectionColor={renderColors.ink}
        sectionSize={0.5}
        sectionThickness={1}
      />
      <SceneTable
        document={document}
        onSelect={() => onSelect({ kind: "TABLE", id: "table" })}
        selected={showSelection && selected.kind === "TABLE"}
      />
      {document.backdrops.map((backdrop) => (
        <mesh
          castShadow
          key={backdrop.id}
          onClick={select({ kind: "BACKDROP", id: backdrop.id })}
          position={[
            backdrop.transform.positionMm.x / 1_000,
            (backdrop.transform.positionMm.y + backdrop.sizeMm.height / 2) /
              1_000,
            backdrop.transform.positionMm.z / 1_000,
          ]}
          rotation={[
            0,
            (backdrop.transform.rotationMilliDegrees.y / 180_000) * Math.PI,
            0,
          ]}
        >
          <boxGeometry
            args={[
              backdrop.sizeMm.width / 1_000,
              backdrop.sizeMm.height / 1_000,
              backdrop.sizeMm.thickness / 1_000,
            ]}
          />
          <meshStandardMaterial
            color={
              showSelection &&
              selected.kind === "BACKDROP" &&
              selected.id === backdrop.id
                ? renderColors.selection
                : backdrop.finish === "BLACK"
                  ? renderColors.backdropBlack
                  : finishColor(backdrop.finish)
            }
            roughness={0.72}
          />
        </mesh>
      ))}
      {document.shelves.map((shelf) => (
        <mesh
          castShadow
          key={shelf.id}
          onClick={select({ kind: "SHELF", id: shelf.id })}
          position={[
            shelf.transform.positionMm.x / 1_000,
            (shelf.transform.positionMm.y + shelf.sizeMm.height / 2) / 1_000,
            shelf.transform.positionMm.z / 1_000,
          ]}
          rotation={[
            0,
            (shelf.transform.rotationMilliDegrees.y / 180_000) * Math.PI,
            0,
          ]}
        >
          <boxGeometry
            args={[
              shelf.sizeMm.width / 1_000,
              shelf.sizeMm.height / 1_000,
              shelf.sizeMm.depth / 1_000,
            ]}
          />
          <meshPhysicalMaterial
            color={
              showSelection &&
              selected.kind === "SHELF" &&
              selected.id === shelf.id
                ? renderColors.selection
                : finishColor(shelf.finish)
            }
            opacity={shelf.finish === "CLEAR" ? 0.62 : 1}
            roughness={0.42}
            transparent={shelf.finish === "CLEAR"}
          />
        </mesh>
      ))}
      {document.instances.map((instance) => {
        const snapshot = snapshotById.get(instance.merchSnapshotId);
        if (!snapshot) return null;
        return (
          <group
            key={instance.id}
            onClick={select({ kind: "INSTANCE", id: instance.id })}
            position={[
              instance.transform.positionMm.x / 1_000,
              instance.transform.positionMm.y / 1_000,
              instance.transform.positionMm.z / 1_000,
            ]}
            rotation={[
              0,
              (instance.transform.rotationMilliDegrees.y / 180_000) * Math.PI,
              0,
            ]}
          >
            <StandeeObject
              artworkUrl={artworkUrls[snapshot.id] ?? null}
              document={snapshot.document}
              turntable={false}
            />
            {showSelection &&
            selected.kind === "INSTANCE" &&
            selected.id === instance.id ? (
              <mesh position={[0, snapshot.document.sizeMm.height / 2_000, 0]}>
                <boxGeometry
                  args={[
                    snapshot.document.sizeMm.width / 900,
                    snapshot.document.sizeMm.height / 900,
                    Math.max(0.025, snapshot.document.base.depthMm / 900),
                  ]}
                />
                <meshBasicMaterial
                  color={renderColors.selection}
                  opacity={0.12}
                  transparent
                  wireframe
                />
              </mesh>
            ) : null}
          </group>
        );
      })}
      <SceneCameraRig document={document} preset={cameraPreset} />
      <OrbitControls
        enableDamping={false}
        maxDistance={20}
        minDistance={0.4}
        target={[0, Math.min(document.footprintMm.height / 3_000, 0.9), 0]}
      />
    </>
  );
}
