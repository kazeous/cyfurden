"use client";

import { verifyFaceboothUploadAction } from "@/app/manage/[boothId]/facebooth/actions";

type PresignResponse = {
  objectKey?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
};

export async function uploadFaceboothPreview(boothId: string, png: Blob) {
  const response = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      boothId,
      purpose: "facebooth-preview",
      contentType: "image/png",
      contentLength: png.size,
    }),
  });
  const presign = (await response.json()) as PresignResponse;
  if (!response.ok || !presign.uploadUrl || !presign.objectKey) {
    throw new Error("Preview upload is unavailable.");
  }
  const uploaded = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.headers,
    body: png,
  });
  if (!uploaded.ok) throw new Error("Preview upload failed.");
  const verification = await verifyFaceboothUploadAction(
    boothId,
    "preview",
    presign.objectKey,
  );
  if (verification.kind !== "verified") {
    throw new Error("Preview verification failed.");
  }
  return presign.objectKey;
}
