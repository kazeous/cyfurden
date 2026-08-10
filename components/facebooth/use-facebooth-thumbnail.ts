"use client";

import { useEffect, useRef } from "react";
import type { FaceboothPngCapture } from "@/components/facebooth/facebooth-png-export";
import { uploadFaceboothPreview } from "@/components/facebooth/facebooth-preview-upload";
import type { FaceboothSaveState } from "@/components/facebooth/use-facebooth-autosave";

export function useFaceboothThumbnail(input: {
  enabled: boolean;
  boothId: string;
  capture: FaceboothPngCapture | null;
  fingerprint: string;
  hasInitialPreview: boolean;
  saveState: FaceboothSaveState;
  savePreview: (objectKey: string) => Promise<boolean>;
  prepareCapture?: (active: boolean) => void;
}) {
  const {
    boothId,
    enabled,
    capture,
    fingerprint,
    hasInitialPreview,
    saveState,
    savePreview,
    prepareCapture,
  } = input;
  const lastSavedFingerprint = useRef(hasInitialPreview ? fingerprint : null);
  useEffect(() => {
    if (
      !enabled ||
      !capture ||
      saveState !== "SAVED" ||
      lastSavedFingerprint.current === fingerprint
    ) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      try {
        prepareCapture?.(true);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const png = await capture({
          width: 512,
          height: 512,
          background: "STUDIO",
        });
        const objectKey = await uploadFaceboothPreview(boothId, png);
        if (active && (await savePreview(objectKey))) {
          lastSavedFingerprint.current = fingerprint;
        }
      } catch {
        // Preview refresh is best-effort and never blocks document autosave.
      } finally {
        prepareCapture?.(false);
      }
    }, 6_000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    boothId,
    capture,
    enabled,
    fingerprint,
    prepareCapture,
    savePreview,
    saveState,
  ]);
}
