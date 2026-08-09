import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 15A installs only the approved 3D runtime behind a client boundary", async () => {
  const [packageJson, boundary, runtime, nextConfig] = await Promise.all([
    readSource("package.json"),
    readSource("components/facebooth/facebooth-canvas-boundary.tsx"),
    readSource("components/facebooth/facebooth-canvas-runtime.tsx"),
    readSource("next.config.ts"),
  ]);
  const packageData = JSON.parse(packageJson) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.match(packageData.dependencies["@react-three/fiber"] ?? "", /^\^9\./);
  assert.match(packageData.dependencies["@react-three/drei"] ?? "", /^\^10\./);
  assert.match(packageData.dependencies.three ?? "", /^\^0\./);
  assert.match(packageData.devDependencies["@types/three"] ?? "", /^\^0\./);
  assert.match(boundary, /^"use client";/);
  assert.match(boundary, /dynamic\(/);
  assert.match(boundary, /ssr: false/);
  assert.match(runtime, /from "@react-three\/fiber"/);
  assert.match(runtime, /from "@react-three\/drei"/);
  assert.match(runtime, /frameloop="demand"/);
  assert.doesNotMatch(nextConfig, /transpilePackages/);

  for (const dependency of [
    "@react-three/cannon",
    "@react-three/postprocessing",
    "framer-motion",
    "zustand",
    "redux",
  ]) {
    assert.equal(packageData.dependencies[dependency], undefined);
  }
});

test("Phase 15A keeps project, upload, and publication actions OWNER/ADMIN scoped", async () => {
  const [actions, projects, uploads, presign, presignRoute] = await Promise.all(
    [
      readSource("app/manage/[boothId]/facebooth/actions.ts"),
      readSource("lib/facebooth-projects.ts"),
      readSource("lib/facebooth-uploads.ts"),
      readSource("lib/oracle-presign.ts"),
      readSource("app/api/uploads/presign/route.ts"),
    ],
  );

  assert.match(actions, /faceboothManagerRoles = \["OWNER", "ADMIN"\]/);
  assert.match(actions, /requireBoothRole\(boothId, faceboothManagerRoles\)/g);
  assert.match(projects, /const managerRoles = \["OWNER", "ADMIN"\]/);
  assert.match(projects, /editVersion: \{ increment: 1 \}/);
  assert.match(projects, /kind: "conflict"/);
  assert.match(projects, /currentEditVersion/);
  assert.match(uploads, /role: \{ in: \["OWNER", "ADMIN"\] \}/);
  assert.match(presign, /verifyBoothFaceboothUpload/);
  assert.match(presign, /isBoothFaceboothObjectKey/);
  assert.match(presign, /result\.Body\.transformToByteArray\(\)/);
  assert.match(presign, /inspectOracleImageBytes/);
  assert.match(presignRoute, /role: \{ in: \["OWNER", "ADMIN"\] \}/);
});

test("Phase 15A migration records versioned booth projects and one publication", async () => {
  const [schema, migration] = await Promise.all([
    readSource("prisma/schema.prisma"),
    readSource(
      "prisma/migrations/0013_phase15a_facebooth_foundation/migration.sql",
    ),
  ]);

  assert.match(schema, /enum FaceboothProjectKind/);
  assert.match(schema, /model FaceboothProject/);
  assert.match(schema, /model FaceboothPublication/);
  assert.match(schema, /@@index\(\[boothId, kind, updatedAt\(sort: Desc\)\]\)/);
  assert.match(schema, /boothId\s+String\s+@unique/);
  assert.match(migration, /FaceboothProject_schema_version_check/);
  assert.match(migration, /FaceboothProject_edit_version_check/);
  assert.match(migration, /FaceboothPublication_revision_check/);
  assert.match(migration, /FaceboothProject_boothId_kind_updatedAt_idx/);
});
